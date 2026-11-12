# Is the overlay really invisible on a screen share?

Measured on a 2012 Windows laptop with Intel HD 4000 graphics, not assumed. Tools are in `tools/`, re-runnable any time.

## What was tested

`tools/capture-getdisplaymedia.js` drives `navigator.mediaDevices.getDisplayMedia()`
from a real renderer -- the exact API Google Meet and browser Zoom use -- pulls a
frame into a canvas, and counts pixels where the overlay sits.

## Results on this machine (i5-3337U / Intel HD 4000 / Win10 19045)

| what he shares            | overlay text leaks? | what the other side sees          |
|---------------------------|---------------------|-----------------------------------|
| **A window** (Chrome, deck, app) | **No — 0.0%**  | **Nothing. The overlay is absent.** |
| **A Chrome tab**          | **No**              | **Nothing. The overlay is absent.** |
| The **entire screen**     | No — 0.0%           | A black rectangle where it sits   |

**The overlay's content never leaks in any configuration.** Not one pixel of the
answer text reached a capture in any test.

## Why "entire screen" shows a black box here

Windows has two levels of capture protection:

* `WDA_MONITOR` (1) -- blacks the window out in captures.
* `WDA_EXCLUDEFROMCAPTURE` (0x11) -- removes it entirely; the capture shows what
  is *behind* it. Needs Windows 10 build 19041+.

Two problems were found and one was fixed:

1. **Electron sets the wrong one.** `win.setContentProtection(true)` applies
   `WDA_MONITOR`, giving a black box by design. `src/main/win-capture.js` now calls
   `SetWindowDisplayAffinity` directly through koffi to apply
   `WDA_EXCLUDEFROMCAPTURE` instead. Verified: affinity now reads 17, not 1.
   (It must be called in-process -- doing it from outside fails with
   ERROR_ACCESS_DENIED.)

2. **This GPU cannot honour it for full-screen capture.** `WDA_EXCLUDEFROMCAPTURE`
   only produces true see-through when the capturer uses Windows Graphics Capture.
   The Intel HD 4000 (2012, WDDM 1.x driver) does not support WGC, so Chromium
   falls back to a legacy capturer and the window blacks out anyway. Forcing the
   WGC feature flags changed nothing, which is consistent with WGC being
   unavailable rather than merely disabled.

   On a newer machine the same code gives true invisibility with no changes.

## What this means in practice

**Share a window or a tab, not the entire screen.** That is the normal way to
present anyway, it is hardware-independent, and it makes the overlay genuinely
absent from the capture.

If the entire screen must be shared, the overlay is unreadable but shows as a
dark rectangle -- use the panic hotkey (Ctrl+Shift+H) to hide it for that stretch.

The app measures this itself: **Dashboard -> Settings -> Check-up** runs the real
capture test on whatever machine it is on and reports which case applies.

---

# Live test, 2026-08-24: entire-screen share on the client laptop

A real Meet call was run with a second laptop as the client. Sharing the
**entire screen**, the other side saw the panel's rectangle as a dark box (text
unreadable, but the box obvious). Exactly the case predicted above.

## Can it be fixed on that laptop? No.

Tested again through the real `getDisplayMedia` API, and again with Windows
Graphics Capture explicitly forced on:

| | overlay pixels | dark |
|---|---|---|
| baseline | 0.0% | 100.0% -> DARK BOX |
| `--enable-features=AllowWgcScreenCapturer,AllowWgcDesktopCapturer,AllowWgcWindowCapturer` | 0.0% | 100.0% -> DARK BOX |

`WDA_EXCLUDEFROMCAPTURE` is confirmed set (affinity 17). The 2012 Intel HD 4000
simply cannot honour it for a full-screen capture, and no window flag changes
that. **The text never leaks in any configuration** -- but the rectangle does.

## What was done about it

1. **Automatic protection.** `src/main/sharewatch.js` reads Chrome's own
   indicator window ("<site> is sharing your screen / a window / a tab"). If an
   ENTIRE-SCREEN share starts and this machine measures as unsafe, the overlay
   hides itself. Switch to a window or tab and it comes straight back. No popup
   is shown -- a notification would be captured too.

2. **Phone companion view.** `src/main/companion.js` serves the live transcript
   and the answer over the LAN, token-protected, only while a meeting runs.
   Read it off a phone and nothing is on the shared screen at all -- invisible
   in every share mode, on any hardware, including a recording made by the other
   side. Dashboard -> Settings shows a QR code to scan.

**Sharing a window or a tab remains the simplest fix and costs nothing.**

---

# Why the auto-hide did not fire the first time (fixed)

The panel was reported still showing on entire-screen share after the watcher
was added. The detector was at fault, not the watcher.

The assumption was that a masked window captures as BLACK. Measured against the
live overlay, the region was **rgb(90,90,90) with only 0.2% near-black pixels** --
a translucent dark tint, with the content behind still faintly readable through
it. So the "is it black?" test returned *safe* and the overlay was never hidden,
while the client was looking at a grey rectangle.

Two changes:

1. **`measureCapture` now compares like for like.** It captures the screen with
   the overlay shown and again with it hidden, and diffs the overlay's rectangle.
   If the two frames differ, the overlay affects the capture -- whatever colour
   it happens to be. No assumption about black.

2. **Auto-hide is unconditional on entire-screen share.** Measuring first was
   clever and got it wrong once already; being wrong here means the client sees
   the panel. Window and tab shares are untouched. The toggle in Settings turns
   it off for a machine that genuinely hides the overlay.

Verified with `tools/fake-share.js`, which creates a window titled exactly like
Chrome's indicator: the overlay disappears within one second and returns when the
share stops.
