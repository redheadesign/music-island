"""Move and click only the Music Island window belonging to the specified test PID."""
import ctypes
from ctypes import wintypes as w
import json
import sys
import time


def main():
    pid = int(sys.argv[1])
    user = ctypes.WinDLL("user32", use_last_error=True)
    user.SetProcessDpiAwarenessContext.argtypes = [w.HANDLE]
    user.SetProcessDpiAwarenessContext(w.HANDLE(-4))
    enum_callback = ctypes.WINFUNCTYPE(w.BOOL, w.HWND, w.LPARAM)
    user.EnumWindows.argtypes = [enum_callback, w.LPARAM]
    user.GetWindowThreadProcessId.argtypes = [w.HWND, ctypes.POINTER(w.DWORD)]
    user.GetWindowTextW.argtypes = [w.HWND, w.LPWSTR, ctypes.c_int]
    user.IsWindowVisible.argtypes = [w.HWND]
    user.PostMessageW.argtypes = [w.HWND, w.UINT, w.WPARAM, w.LPARAM]
    user.GetClientRect.argtypes = [w.HWND, ctypes.POINTER(w.RECT)]
    user.ClientToScreen.argtypes = [w.HWND, ctypes.POINTER(w.POINT)]
    user.WindowFromPoint.argtypes = [w.POINT]
    user.WindowFromPoint.restype = w.HWND
    user.GetAncestor.argtypes = [w.HWND, w.UINT]
    user.GetAncestor.restype = w.HWND
    user.GetDpiForWindow.argtypes = [w.HWND]
    user.GetDpiForWindow.restype = w.UINT
    user.MonitorFromWindow.argtypes = [w.HWND, w.DWORD]
    user.MonitorFromWindow.restype = w.HANDLE
    class MonitorInfo(ctypes.Structure):
        _fields_ = [("size", w.DWORD), ("monitor", w.RECT), ("work", w.RECT),
                    ("flags", w.DWORD), ("device", w.WCHAR * 32)]
    user.GetMonitorInfoW.argtypes = [w.HANDLE, ctypes.POINTER(MonitorInfo)]
    gdi = ctypes.WinDLL("gdi32", use_last_error=True)
    gdi.CreateDCW.argtypes = [w.LPCWSTR, w.LPCWSTR, w.LPCWSTR, ctypes.c_void_p]
    gdi.CreateDCW.restype = w.HDC
    gdi.GetDeviceCaps.argtypes = [w.HDC, ctypes.c_int]
    gdi.DeleteDC.argtypes = [w.HDC]

    def find(title, visible=False, allow_missing=False):
        found = []
        @enum_callback
        def inspect(window, _):
            owner = w.DWORD()
            user.GetWindowThreadProcessId(window, ctypes.byref(owner))
            if owner.value == pid:
                name = ctypes.create_unicode_buffer(256)
                user.GetWindowTextW(window, name, len(name))
                if name.value == title and (not visible or user.IsWindowVisible(window)):
                    found.append(window)
            return True
        user.EnumWindows(inspect, 0)
        if not found and allow_missing:
            return None
        if len(found) != 1:
            raise RuntimeError(f"Expected one {title} window for PID {pid}")
        return found[0]

    def run(request):
        op = request["op"]
        if op in ("settings", "dismiss"):
            window = find("Music Island Settings")
            if op == "dismiss" and user.IsWindowVisible(window):
                user.PostMessageW(window, 0x0010, 0, 0)  # WM_CLOSE hides the owned settings window.
            return bool(user.IsWindowVisible(window))
        # The hidden single-instance notice also has the title "Music Island".
        window = find("Music Island", visible=True, allow_missing=op == "display")
        if op == "display":
            if window is None:
                return None
            monitor = user.MonitorFromWindow(window, 2)
            info = MonitorInfo()
            info.size = ctypes.sizeof(info)
            if not user.GetMonitorInfoW(monitor, ctypes.byref(info)):
                raise ctypes.WinError(ctypes.get_last_error())
            dc = gdi.CreateDCW("DISPLAY", info.device, None, None)
            if not dc:
                raise ctypes.WinError(ctypes.get_last_error())
            try:
                hz = gdi.GetDeviceCaps(dc, 116)  # VREFRESH on the owning monitor.
                return {"dpi": user.GetDpiForWindow(window), "hz": hz if hz > 1 else None,
                        "device": info.device, "width": info.monitor.right - info.monitor.left,
                        "height": info.monitor.bottom - info.monitor.top}
            finally:
                gdi.DeleteDC(dc)
        rect = w.RECT()
        if not user.GetClientRect(window, ctypes.byref(rect)):
            raise ctypes.WinError(ctypes.get_last_error())
        width, height = rect.right, rect.bottom
        if op == "edge":
            point = w.POINT(width // 2, 0)
        elif op == "leave":
            point = w.POINT(width // 2, height - 8)
        elif op == "click":
            point = w.POINT(round(request["x"] * width), round(request["y"] * height))
            if not (0 <= point.x < width and 0 <= point.y < height):
                raise ValueError("Point outside the owned overlay")
        else:
            raise ValueError(f"Unsupported operation: {op}")
        if not user.ClientToScreen(window, ctypes.byref(point)):
            raise ctypes.WinError(ctypes.get_last_error())
        began = time.time_ns() / 1e6
        if not user.SetCursorPos(point.x, point.y):
            raise ctypes.WinError(ctypes.get_last_error())
        if op != "click":
            return {"at": began}
        hit = user.WindowFromPoint(point)
        if not hit or user.GetAncestor(hit, 2) != window:  # GA_ROOT
            return {"at": began, "sent": False, "reason": "native-hit-missed"}
        # OS input, delivered through normal hit testing; never send a synthetic DOM click.
        user.mouse_event(0x0002, 0, 0, 0, 0)  # MOUSEEVENTF_LEFTDOWN
        user.mouse_event(0x0004, 0, 0, 0, 0)  # MOUSEEVENTF_LEFTUP
        return {"at": began, "sent": True}

    for line in sys.stdin:
        try:
            print(json.dumps({"value": run(json.loads(line))}), flush=True)
        except Exception as err:
            print(json.dumps({"error": str(err)}), flush=True)


if __name__ == "__main__":
    main()
