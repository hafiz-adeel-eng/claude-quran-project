'use strict';
/**
 * Makes the overlay genuinely invisible to screen sharing on Windows.
 *
 * Why this file exists:
 *
 * Electron's `win.setContentProtection(true)` sets the window's display
 * affinity to WDA_MONITOR (1). That does hide the CONTENT from a capture -- but
 * it hides it by painting the window's rectangle SOLID BLACK in the captured
 * image. On a shared screen that is a large black rectangle sitting on top of
 * your slides: more conspicuous than the overlay itself.
 *
 * What we actually want is WDA_EXCLUDEFROMCAPTURE (0x11), added in Windows 10
 * version 2004 (build 19041). With it the window is skipped entirely during
 * capture composition, so the capture shows whatever is BEHIND the window,
 * while the window stays fully visible on the physical display.
 *
 * SetWindowDisplayAffinity can only be called by the process that owns the
 * window (cross-process attempts fail with ERROR_ACCESS_DENIED), so we call it
 * in-process through koffi rather than shelling out.
 *
 * If anything here fails we fall back to Electron's setContentProtection --
 * a black box is still better than the overlay being readable.
 */

const os = require('os');

const WDA_NONE = 0x00;
const WDA_MONITOR = 0x01;
const WDA_EXCLUDEFROMCAPTURE = 0x11;

let user32 = null;
let SetWindowDisplayAffinity = null;
let GetWindowDisplayAffinity = null;
let loadError = null;

function load() {
  if (user32 || loadError) return;
  try {
    const koffi = require('koffi');
    user32 = koffi.load('user32.dll');
    // HWND is passed by VALUE as an integer handle. Declaring it 'void *' and
    // handing koffi the Buffer from getNativeWindowHandle() passes a pointer to
    // the buffer instead of the handle inside it, and the call fails silently.
    SetWindowDisplayAffinity = user32.func('__stdcall', 'SetWindowDisplayAffinity', 'bool',
      ['uintptr_t', 'uint32']);
    GetWindowDisplayAffinity = user32.func('__stdcall', 'GetWindowDisplayAffinity', 'bool',
      ['uintptr_t', koffi.out(koffi.pointer('uint32'))]);
  } catch (e) {
    loadError = e;
  }
}

/** Windows 10 build 19041+ is required for WDA_EXCLUDEFROMCAPTURE. */
function supportsExcludeFromCapture() {
  if (process.platform !== 'win32') return false;
  const m = /(\d+)\.(\d+)\.(\d+)/.exec(os.release());
  if (!m) return false;
  const build = parseInt(m[3], 10);
  return build >= 19041;
}

/** Unwrap the integer HWND from the Buffer Electron hands back. */
function hwndOf(win) {
  try {
    const buf = win.getNativeWindowHandle();
    if (!buf || !buf.length) return null;
    const v = buf.length >= 8 ? buf.readBigUInt64LE(0) : BigInt(buf.readUInt32LE(0));
    return Number(v);                            // handles are far below 2^53
  } catch {
    return null;
  }
}

/**
 * Hide `win` from screen capture as thoroughly as this machine allows.
 * Returns { mode, ok, detail } describing what was actually applied.
 */
function hideFromCapture(win) {
  if (process.platform !== 'win32') {
    // macOS: NSWindowSharingNone. Whether a given capture path honours it
    // varies by macOS version, so the doctor's measureCapture() is the real
    // answer; this only reports that the flag was set.
    try { win.setContentProtection(true); } catch (e) {
      return { mode: 'contentProtection', ok: false, detail: 'setContentProtection failed: ' + e.message };
    }
    return { mode: 'NSWindowSharingNone', ok: true, detail: 'Content protection set; see the capture test for what a viewer actually sees.' };
  }

  // Always set Electron's flag too: it covers the paths koffi does not, and it
  // is what protects the window if our FFI call is later reverted.
  try { win.setContentProtection(true); } catch { /* ignore */ }

  if (!supportsExcludeFromCapture()) {
    return {
      mode: 'WDA_MONITOR', ok: false,
      detail: `Windows build ${os.release()} is older than 19041; capture shows a black box instead of hiding the overlay.`,
    };
  }

  load();
  if (loadError || !SetWindowDisplayAffinity) {
    return { mode: 'WDA_MONITOR', ok: false, detail: 'koffi unavailable: ' + String(loadError && loadError.message) };
  }

  const hwnd = hwndOf(win);
  if (hwnd == null) return { mode: 'WDA_MONITOR', ok: false, detail: 'Could not read the window handle.' };

  try {
    const ok = SetWindowDisplayAffinity(hwnd, WDA_EXCLUDEFROMCAPTURE);
    const got = getAffinity(hwnd);
    if (ok && got === WDA_EXCLUDEFROMCAPTURE) {
      return { mode: 'WDA_EXCLUDEFROMCAPTURE', ok: true, detail: 'Overlay is skipped by screen capture.' };
    }
    return { mode: 'WDA_MONITOR', ok: false, detail: `SetWindowDisplayAffinity did not stick (returned ${ok}, affinity ${got}).` };
  } catch (e) {
    return { mode: 'WDA_MONITOR', ok: false, detail: String(e.message || e) };
  }
}

function getAffinity(hwnd) {
  try {
    load();
    if (!GetWindowDisplayAffinity || hwnd == null) return null;
    const out = [0];
    const ok = GetWindowDisplayAffinity(hwnd, out);
    return ok ? out[0] : null;
  } catch {
    return null;
  }
}

/** Make the window capturable again (used only for diagnostics). */
function showToCapture(win) {
  try { win.setContentProtection(false); } catch { /* ignore */ }
  const hwnd = hwndOf(win);
  if (hwnd == null) return false;
  try {
    load();
    return SetWindowDisplayAffinity ? SetWindowDisplayAffinity(hwnd, WDA_NONE) : false;
  } catch {
    return false;
  }
}

function affinityOf(win) {
  const hwnd = hwndOf(win);
  return hwnd == null ? null : getAffinity(hwnd);
}

module.exports = {
  hideFromCapture, showToCapture, affinityOf, supportsExcludeFromCapture,
  WDA_NONE, WDA_MONITOR, WDA_EXCLUDEFROMCAPTURE,
};
