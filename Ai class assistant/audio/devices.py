"""
WASAPI device discovery + default-device tracking.

The overlay must keep working when you plug in headphones, connects a
Bluetooth speaker, or switches the meeting to a USB headset mid-call. So we
never bind to a device index permanently -- we bind to "whatever Windows
currently calls the default", and re-check on a timer.
"""

import sys

if sys.platform == "darwin":
    import mac_pa as pa          # same API, Core Audio + ScreenCaptureKit
else:
    import pyaudiowpatch as pa

LOOPBACK_SUFFIX = " [Loopback]"


def wasapi(p):
    return p.get_host_api_info_by_type(pa.paWASAPI)


def default_output(p):
    """Device dict for the endpoint Windows is currently playing to."""
    try:
        return p.get_device_info_by_index(wasapi(p)["defaultOutputDevice"])
    except Exception:
        return None


def default_input(p):
    """Device dict for the mic Windows is currently listening on."""
    try:
        return p.get_device_info_by_index(wasapi(p)["defaultInputDevice"])
    except Exception:
        return None


def loopback_for(p, out_dev):
    """
    Find the loopback capture endpoint that mirrors a given output device.

    PyAudioWPatch exposes these as separate input devices named
    "<output name> [Loopback]". Exact match first, then a prefix match, because
    some drivers pad or truncate the name.
    """
    if not out_dev:
        return None
    want = out_dev["name"] + LOOPBACK_SUFFIX
    candidates = list(p.get_loopback_device_info_generator())
    for d in candidates:
        if d["name"] == want:
            return d
    for d in candidates:
        if d["name"].startswith(out_dev["name"]):
            return d
    return None


def list_outputs(p):
    idx = wasapi(p)["index"]
    out = []
    for i in range(p.get_device_count()):
        d = p.get_device_info_by_index(i)
        if d["hostApi"] == idx and d["maxOutputChannels"] > 0 and LOOPBACK_SUFFIX not in d["name"]:
            out.append(d)
    return out


def list_inputs(p):
    idx = wasapi(p)["index"]
    out = []
    for i in range(p.get_device_count()):
        d = p.get_device_info_by_index(i)
        if d["hostApi"] == idx and d["maxInputChannels"] > 0 and LOOPBACK_SUFFIX not in d["name"]:
            out.append(d)
    return out


def describe(d, is_default=False):
    return {
        "index": int(d["index"]),
        "name": d["name"],
        "channels_in": int(d["maxInputChannels"]),
        "channels_out": int(d["maxOutputChannels"]),
        "sample_rate": int(d["defaultSampleRate"]),
        "default": bool(is_default),
    }


def list_all(p):
    """
    Everything the user could pick, the way Zoom shows it.

    Names, not indices, are what we persist. PortAudio indices shift whenever a
    device connects or disconnects, so a saved index silently starts pointing at
    the wrong headset; a saved name does not.
    """
    out_def = default_output(p)
    in_def = default_input(p)
    return {
        "inputs": [describe(d, in_def and d["index"] == in_def["index"]) for d in list_inputs(p)],
        "outputs": [describe(d, out_def and d["index"] == out_def["index"]) for d in list_outputs(p)],
        "default_input": in_def["name"] if in_def else None,
        "default_output": out_def["name"] if out_def else None,
    }


def find_by_name(p, name, want_output):
    """Resolve a saved device NAME back to a live device, or None if unplugged."""
    if not name:
        return None
    pool = list_outputs(p) if want_output else list_inputs(p)
    for d in pool:
        if d["name"] == name:
            return d
    for d in pool:                       # drivers sometimes pad or truncate names
        if d["name"].startswith(name[:28]):
            return d
    return None


def signature(p):
    """
    Cheap fingerprint of the current routing. When this string changes, the
    user has switched headphones/speakers/mic and the streams must be rebuilt.
    """
    o = default_output(p)
    i = default_input(p)
    return "{}|{}".format(o["name"] if o else "-", i["name"] if i else "-")
