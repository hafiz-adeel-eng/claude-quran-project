'use strict';
/**
 * Notices when a screen share starts, and which KIND it is.
 *
 * Why this is needed: on a GPU without Windows Graphics Capture (for example a 2012 laptop's
 * Intel HD 4000), a window cannot be excluded from a full-screen capture.
 * The overlay's text never leaks, but its rectangle shows up as a dark box --
 * which is exactly what the other side saw during the first live test.
 *
 * Sharing a WINDOW or a TAB is unaffected, because those captures never contain
 * anything floating on top. So the fix is not to hide always -- it is to know
 * which mode is running and hide only for the one that is unsafe.
 *
 * Chrome announces it itself, in a small always-on-top window whose title is one
 * of:
 *      "<site> is sharing your screen."
 *      "<site> is sharing a window."
 *      "<site> is sharing a tab."
 *
 * We walk the top-level window list and read those titles. No callbacks into
 * koffi (which needs a registered prototype); GetWindow(GW_HWNDNEXT) chaining
 * does the same job with plain calls.
 */

const GW_HWNDFIRST = 0;
const GW_HWNDNEXT = 2;
const GW_CHILD = 5;

let user32 = null;
let fns = null;
let loadError = null;

function load() {
  if (fns || loadError) return;
  try {
    const koffi = require('koffi');
    user32 = koffi.load('user32.dll');
    fns = {
      GetDesktopWindow: user32.func('__stdcall', 'GetDesktopWindow', 'uintptr_t', []),
      GetWindow: user32.func('__stdcall', 'GetWindow', 'uintptr_t', ['uintptr_t', 'uint32']),
      IsWindowVisible: user32.func('__stdcall', 'IsWindowVisible', 'bool', ['uintptr_t']),
      GetWindowTextLengthW: user32.func('__stdcall', 'GetWindowTextLengthW', 'int', ['uintptr_t']),
      GetWindowTextW: user32.func('__stdcall', 'GetWindowTextW', 'int',
        ['uintptr_t', koffi.out(koffi.pointer('uint16')), 'int']),
    };
  } catch (e) {
    loadError = e;
  }
}

function titleOf(hwnd) {
  const len = fns.GetWindowTextLengthW(hwnd);
  if (!len || len > 512) return '';
  const buf = new Uint16Array(len + 1);
  const n = fns.GetWindowTextW(hwnd, buf, len + 1);
  if (n <= 0) return '';
  let s = '';
  for (let i = 0; i < n; i++) s += String.fromCharCode(buf[i]);
  return s;
}

/** Titles of every visible top-level window. */
function visibleTitles() {
  load();
  if (loadError || !fns) return [];
  const out = [];
  try {
    let h = fns.GetWindow(fns.GetDesktopWindow(), GW_CHILD);
    let guard = 0;
    while (h && guard++ < 4000) {
      if (fns.IsWindowVisible(h)) {
        const t = titleOf(h);
        if (t) out.push(t);
      }
      h = fns.GetWindow(h, GW_HWNDNEXT);
    }
  } catch { /* fall through with whatever we got */ }
  return out;
}

/**
 * @returns {{sharing: boolean, mode: 'screen'|'window'|'tab'|null, title: string|null}}
 */
function detectShare() {
  for (const t of visibleTitles()) {
    const low = t.toLowerCase();
    if (!low.includes('is sharing')) continue;
    // Order matters: "your screen" is the unsafe one.
    if (low.includes('your screen') || low.includes('your entire screen')) {
      return { sharing: true, mode: 'screen', title: t };
    }
    if (low.includes('a window') || low.includes('your window')) {
      return { sharing: true, mode: 'window', title: t };
    }
    if (low.includes('a tab') || low.includes('this tab')) {
      return { sharing: true, mode: 'tab', title: t };
    }
    return { sharing: true, mode: null, title: t };
  }
  return { sharing: false, mode: null, title: null };
}

/**
 * Poll for changes. `onChange(state, prev)` fires only when it actually changes,
 * so callers do not need to debounce.
 */
function watch(onChange, intervalMs = 1500) {
  let prev = { sharing: false, mode: null, title: null };
  const tick = () => {
    let now;
    try { now = detectShare(); } catch { return; }
    if (now.sharing !== prev.sharing || now.mode !== prev.mode) {
      const before = prev;
      prev = now;
      try { onChange(now, before); } catch { /* never let the poller die */ }
    }
  };
  tick();
  const id = setInterval(tick, intervalMs);
  return () => clearInterval(id);
}

module.exports = { detectShare, watch, visibleTitles };
