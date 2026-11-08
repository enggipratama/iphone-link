"""WindowApi class — JS-accessible API for the WebView2 frontend.

Extracted from gui.py.
"""

from __future__ import annotations

import ctypes
from ctypes import wintypes
import sys

import json
import threading
import time
from typing import Any

from handset.window_effects import reapply_dwm_rounded_corners
from handset.device_screen import get_dimensions_for_product, is_ipad

class WindowApi:
    """JS-accessible API exposed under window.pywebview.api."""

    def __init__(self, host: str = "127.0.0.1", port: int = 8765):
        self._window = None
        self._host = host
        self._port = port
        self._cached_hwnd: int | None = None
        self._current_display_width = 346
        self._ideal_display_width = 346
        self._drawer_open = False
        self._is_landscape = False
        self._hidden_to_tray = False
        self._is_fullscreen = False
        self._saved_window_pos: tuple[int, int] | None = None
        self._saved_portrait_phys_size: tuple[int, int] | None = None
        self._saved_landscape_phys_size: tuple[int, int] | None = None

    def _get_window_dpi_scale(self, hwnd: int | None = None) -> float:
        """Tahap 76: Accurately query per-monitor or system DPI scaling factor (e.g. 1.25x or 1.5x)."""
        if sys.platform != "win32":
            return 1.0
        target_hwnd = hwnd or self._get_hwnd()
        user32 = getattr(ctypes.windll, "user32", None)
        if target_hwnd and user32 and hasattr(user32, "GetDpiForWindow"):
            try:
                dpi = user32.GetDpiForWindow(wintypes.HWND(target_hwnd))
                if dpi and dpi > 0:
                    return max(1.0, float(dpi) / 96.0)
            except Exception:
                pass
        if user32 and hasattr(user32, "GetDpiForSystem"):
            try:
                dpi = user32.GetDpiForSystem()
                if dpi and dpi > 0:
                    return max(1.0, float(dpi) / 96.0)
            except Exception:
                pass
        try:
            gdi32 = getattr(ctypes.windll, "gdi32", None)
            if user32 and gdi32:
                hdc = user32.GetDC(0)
                if hdc:
                    dpi_y = gdi32.GetDeviceCaps(hdc, 90)  # LOGPIXELSY = 90
                    user32.ReleaseDC(0, hdc)
                    if dpi_y and dpi_y > 0:
                        return max(1.0, float(dpi_y) / 96.0)
        except Exception:
            pass
        return 1.0

    def _schedule_reapply_corners(self):
        """Tahap 71 & 75: Re-apply DWM rounded corners immediately, at 0.08s, and 0.22s after window state changes."""
        hwnd = self._get_hwnd()
        if hwnd:
            is_fs = getattr(self, "_is_fullscreen", False)
            reapply_dwm_rounded_corners(hwnd, is_fs)
            threading.Timer(0.08, lambda: reapply_dwm_rounded_corners(self._get_hwnd(), getattr(self, "_is_fullscreen", False))).start()
            threading.Timer(0.22, lambda: reapply_dwm_rounded_corners(self._get_hwnd(), getattr(self, "_is_fullscreen", False))).start()

    def set_window(self, window):
        self._window = window

    def resize_for_device(self, product_type: str | None = None) -> dict:
        """Resize window to match connected device screen dimensions."""
        if self._window is None:
            return {"ok": False, "error": "no window"}
        width, height = get_dimensions_for_product(product_type)
        # Scale down slightly for comfortable desktop viewing
        scale = 0.85 if is_ipad(product_type) else 1.0
        target_w = int(width * scale)
        target_h = int(height * scale)
        try:
            self._window.resize(target_w, target_h)
            self._ideal_display_width = target_w
            self._current_display_width = target_w
            return {"ok": True, "width": target_w, "height": target_h, "ipad": is_ipad(product_type)}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    def _get_hwnd(self):
        try:
            if self._cached_hwnd and ctypes.windll.user32.IsWindow(wintypes.HWND(self._cached_hwnd)):
                return self._cached_hwnd
            h = ctypes.windll.user32.FindWindowW(None, "iPhone Link")
            if not h:
                h = ctypes.windll.user32.FindWindowW(None, "iPhone Mirroring")
            if not h:
                h = ctypes.windll.user32.FindWindowW(None, "iPhone Link UI Self-Test")
            if not h and self._window and hasattr(self._window, "title"):
                h = ctypes.windll.user32.FindWindowW(None, str(self._window.title))
            if not h:
                try:
                    from webview.platforms.winforms import BrowserView
                    for form in list(BrowserView.instances.values()):
                        if form and hasattr(form, "Handle"):
                            cand = int(form.Handle.ToInt64() if hasattr(form.Handle, "ToInt64") else int(form.Handle))
                            if cand and ctypes.windll.user32.IsWindow(wintypes.HWND(cand)):
                                h = cand
                                break
                except Exception:
                    pass
            if h:
                self._cached_hwnd = h
            return h
        except Exception:
            return None

    def _eval_js(self, script: str) -> None:
        if self._window is None:
            return
        try:
            self._window.evaluate_js(script)
        except Exception:
            pass

    def _api_post(self, path: str, payload: bytes = b"{}", timeout: float = 1.5) -> dict:
        # [Tahap 70] moved to module top-level

        req = urllib.request.Request(
            f"http://{self._host}:{self._port}{path}",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))

    def start_window_drag(self) -> None:
        """Start native Windows window dragging without pywebview global hook."""
        if self._window is None or sys.platform != "win32":
            return
        try:
            hwnd = self._get_hwnd()
            if hwnd:
                # [Tahap 70] moved to module top-level
                # [Tahap 70] moved to module top-level

                ctypes.windll.user32.ReleaseCapture()
                ctypes.windll.user32.SendMessageW(wintypes.HWND(hwnd), 0x00A1, 2, 0)  # WM_NCLBUTTONDOWN, HTCAPTION
        except Exception:
            pass

    def minimize(self):
        if self._window:
            self._window.minimize()
            self._schedule_reapply_corners()

    def minimize_to_tray(self):
        """Hide window to Windows 11 System Tray while keeping mirroring & audio alive in background."""
        self._hidden_to_tray = True
        if sys.platform == "win32":
            hwnd = self._get_hwnd()
            if hwnd:
                try:
                    # [Tahap 70] moved to module top-level
                    # [Tahap 70] moved to module top-level

                    ctypes.windll.user32.ShowWindow(wintypes.HWND(hwnd), 0)  # SW_HIDE
                    return {"ok": True, "hidden": True}
                except Exception:
                    pass
        if self._window:
            try:
                self._window.hide()
            except Exception:
                pass
        return {"ok": True, "hidden": True}

    def restore_from_tray(self):
        """Show/restore iPhone Link window from System Tray or minimized state and bring to front."""
        self._hidden_to_tray = False
        if sys.platform == "win32":
            hwnd = self._get_hwnd()
            if hwnd:
                try:
                    # [Tahap 70] moved to module top-level
                    # [Tahap 70] moved to module top-level

                    user32 = ctypes.windll.user32
                    wh = wintypes.HWND(hwnd)
                    if not user32.IsWindowVisible(wh):
                        user32.ShowWindow(wh, 5)  # SW_SHOW
                    if user32.IsIconic(wh):
                        user32.ShowWindow(wh, 9)  # SW_RESTORE
                    user32.BringWindowToTop(wh)
                    user32.SetForegroundWindow(wh)
                except Exception:
                    pass
        if self._window:
            try:
                self._window.show()
                self._window.restore()
            except Exception:
                pass
            self._schedule_reapply_corners()
            self._eval_js("window.dispatchEvent(new Event('resize'));")
        return {"ok": True, "hidden": False}

    def toggle_tray_window(self):
        """Left-click System Tray handler: restore/focus if hidden or minimized, else hide to tray."""
        if sys.platform == "win32":
            hwnd = self._get_hwnd()
            if hwnd:
                try:
                    # [Tahap 70] moved to module top-level
                    # [Tahap 70] moved to module top-level

                    user32 = ctypes.windll.user32
                    wh = wintypes.HWND(hwnd)
                    if self._hidden_to_tray or not user32.IsWindowVisible(wh) or user32.IsIconic(wh):
                        return self.restore_from_tray()
                    if user32.GetForegroundWindow() != hwnd:
                        return self.restore_from_tray()
                    return self.minimize_to_tray()
                except Exception:
                    pass
        if self._hidden_to_tray:
            return self.restore_from_tray()
        return self.minimize_to_tray()

    def tray_toggle_landscape(self):
        if self._hidden_to_tray:
            self.restore_from_tray()
        self._eval_js("if (window.toggleLandscapeMode) window.toggleLandscapeMode();")

    def tray_toggle_stealth(self):
        if self._window is not None:
            self._eval_js("if (window.triggerToggleStealthDim) window.triggerToggleStealthDim();")
            return
        try:
            self._api_post("/api/device/stealth", b'{"enabled": true}')
        except Exception:
            pass

    def tray_toggle_audio(self):
        if self._window is not None:
            self._eval_js("if (window.trayToggleAudio) window.trayToggleAudio();")
            return
        try:
            self._api_post("/api/audio/toggle", b"{}")
        except Exception:
            pass

    def tray_clear_copy_cache(self):
        try:
            self._api_post("/api/ocr/clear-chunks", b"{}", timeout=0.8)
        except Exception:
            pass
        self._eval_js("if (window.triggerClearCopyCacheWithFeedback) window.triggerClearCopyCacheWithFeedback();")

    def get_tray_menu_state(self) -> dict[str, bool]:
        """Query live stealth & audio state from isolated server child process when tray menu opens."""
        stealth_on = False
        audio_on = False
        try:
            # [Tahap 70] moved to module top-level

            req = urllib.request.Request(f"http://{self._host}:{self._port}/api/tray-state")
            with urllib.request.urlopen(req, timeout=0.35) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                stealth_on = bool(data.get("stealth"))
                audio_on = bool(data.get("audio"))
        except Exception:
            pass
        return {
            "landscape": bool(self._is_landscape),
            "stealth": stealth_on,
            "audio": audio_on,
        }

    def close(self):
        global _ACTIVE_TRAY_ICON
        tray = _ACTIVE_TRAY_ICON
        _ACTIVE_TRAY_ICON = None
        try:
            hwnd = self._get_hwnd()
            if hwnd:
                # [Tahap 70] moved to module top-level
                # [Tahap 70] moved to module top-level
                ctypes.windll.user32.ShowWindow(wintypes.HWND(hwnd), 0)
        except Exception:
            pass
        if tray is not None:
            try:
                tray.stop()
            except Exception:
                pass
        try:
            shutdown_backend_server()
        except Exception:
            pass
        if self._window:
            try:
                self._window.destroy()
            except Exception:
                pass
        # Tahap 69: Instant os._exit(0) on close to release locks and storage instantly
        # [Tahap 70] moved to module top-level
        os._exit(0)

    def toggle_fullscreen(self, target_state: bool = None):
        if not self._window:
            return {"ok": False, "fullscreen": False, "is_fullscreen": False}

        hwnd = self._get_hwnd()
        user32 = getattr(ctypes.windll, "user32", None)

        # Step A: Determine whether physically fullscreen or target state
        work_left, work_top = 0, 0
        work_w = 1920
        work_h = 1080
        is_physically_full = False
        if hwnd and user32:
            work_rect = wintypes.RECT()
            if user32.SystemParametersInfoW(0x0030, 0, ctypes.byref(work_rect), 0):
                work_left = int(work_rect.left)
                work_top = int(work_rect.top)
                work_w = int(work_rect.right - work_rect.left)
                work_h = int(work_rect.bottom - work_rect.top)
            else:
                work_w = int(user32.GetSystemMetrics(0))
                work_h = int(user32.GetSystemMetrics(1))

            cur_rect = wintypes.RECT()
            if user32.GetWindowRect(wintypes.HWND(hwnd), ctypes.byref(cur_rect)):
                cur_w = cur_rect.right - cur_rect.left
                cur_h = cur_rect.bottom - cur_rect.top
                if cur_w >= (work_w - 60) and cur_h >= (work_h - 60):
                    is_physically_full = True

        if target_state is not None:
            want_fullscreen = bool(target_state)
        else:
            was_fullscreen = bool(getattr(self, "_is_fullscreen", False)) or is_physically_full
            want_fullscreen = not was_fullscreen

        if want_fullscreen:
            # Entering Full Screen
            if hwnd and user32:
                rect = wintypes.RECT()
                if user32.GetWindowRect(wintypes.HWND(hwnd), ctypes.byref(rect)):
                    cur_w = rect.right - rect.left
                    cur_h = rect.bottom - rect.top
                    if cur_w < (work_w - 80) and (rect.left > 15 or rect.top > 15):
                        self._saved_window_pos = (int(rect.left), int(rect.top))
                    if not getattr(self, "_is_landscape", False) and not getattr(self, "_drawer_open", False):
                        if 300 <= cur_w <= 650 and cur_h >= int(cur_w * 2.15):
                            self._saved_portrait_phys_size = (int(cur_w), int(cur_h))

                self._is_fullscreen = True
                self._drawer_open = False

                # Gunakan SetWindowPos langsung tanpa ShowWindow SW_MAXIMIZE
                user32.SetWindowPos(
                    wintypes.HWND(hwnd),
                    0,
                    int(work_left),
                    int(work_top),
                    int(work_w),
                    int(work_h),
                    0x0004 | 0x0020 | 0x0040,  # SWP_NOZORDER | SWP_FRAMECHANGED | SWP_SHOWWINDOW
                )
            else:
                self._is_fullscreen = True
                self._drawer_open = False
                try:
                    self._window.toggle_fullscreen()
                except Exception:
                    pass

            self._eval_js("if (window.applyFullsizeState) window.applyFullsizeState(true, true);")
            self._schedule_reapply_corners()
            return {
                "ok": True,
                "fullscreen": True,
                "is_fullscreen": True,
            }
        else:
            # Exiting Full Screen -> Mode Window normal
            self._is_fullscreen = False

            if hwnd and user32:
                wh = wintypes.HWND(hwnd)
                # Bersihkan bit WS_MAXIMIZE (0x01000000) jika menempel
                style = user32.GetWindowLongW(wh, -16)
                if style & 0x01000000:
                    user32.SetWindowLongW(wh, -16, style & ~0x01000000)
                user32.ShowWindow(wh, 9)  # SW_RESTORE

            if getattr(self, "_is_landscape", False):
                logical_w = 1200 if self._drawer_open else 840
                logical_h = 468
                base_w = 840
            else:
                base_w = getattr(self, "_ideal_display_width", getattr(self, "_current_display_width", 346)) or 346
                logical_w = (base_w + 360) if self._drawer_open else base_w
                logical_h = 832

            # Panggil self._window.resize(logical_w, logical_h) lebih dulu agar pywebview Form menghitung DPI
            try:
                self._window.resize(int(logical_w), int(logical_h))
            except Exception:
                pass

            dpi_scale = self._get_window_dpi_scale(hwnd)
            after_rect = wintypes.RECT()
            has_after = False
            if hwnd and user32:
                has_after = bool(user32.GetWindowRect(wintypes.HWND(hwnd), ctypes.byref(after_rect)))

            if getattr(self, "_is_landscape", False):
                phys_w = int(round(logical_w * dpi_scale))
                phys_h = int(round(logical_h * dpi_scale))
            else:
                if not self._drawer_open and getattr(self, "_saved_portrait_phys_size", None):
                    saved_pw, saved_ph = self._saved_portrait_phys_size
                    if 300 <= saved_pw <= 650 and saved_ph >= int(saved_pw * 2.15):
                        phys_w, phys_h = saved_pw, saved_ph
                    else:
                        form_w = (after_rect.right - after_rect.left) if has_after else 0
                        phys_w = max(int(round(logical_w * dpi_scale)), form_w)
                        ideal_ph = int(round(phys_w * (832.0 / float(base_w)))) if base_w > 0 else int(round(phys_w * 2.4046))
                        phys_h = min(int(work_h - 16), max(ideal_ph, int(round(832.0 * dpi_scale))))
                else:
                    form_w = (after_rect.right - after_rect.left) if has_after else 0
                    phys_w = max(int(round(logical_w * dpi_scale)), form_w)
                    ideal_ph = int(round(phys_w * (832.0 / float(base_w)))) if base_w > 0 else int(round(phys_w * 2.4046))
                    phys_h = min(int(work_h - 16), max(ideal_ph, int(round(832.0 * dpi_scale))))

            saved = getattr(self, "_saved_window_pos", None)
            if saved and (saved[0] > 15 or saved[1] > 15) and saved[0] < (work_w - 100) and saved[1] < (work_h - 100):
                restore_x, restore_y = int(saved[0]), int(saved[1])
            else:
                restore_x = work_left + max(24, (work_w - phys_w) // 2)
                restore_y = work_top + max(24, (work_h - phys_h) // 2)

            if hwnd and user32:
                wh = wintypes.HWND(hwnd)
                user32.SetWindowPos(
                    wh,
                    0,
                    int(restore_x),
                    int(restore_y),
                    int(phys_w),
                    int(phys_h),
                    0x0004 | 0x0020 | 0x0040,
                )
                reapply_dwm_rounded_corners(hwnd, False)

            try:
                self._window.move(int(restore_x), int(restore_y))
            except Exception:
                pass

            # Verification watchdog timer at 0.06s to recheck physical aspect ratio
            def _verify_restore():
                try:
                    if hwnd and user32 and not getattr(self, "_is_fullscreen", False) and not getattr(self, "_is_landscape", False):
                        vr = wintypes.RECT()
                        if user32.GetWindowRect(wintypes.HWND(hwnd), ctypes.byref(vr)):
                            vw = vr.right - vr.left
                            vh = vr.bottom - vr.top
                            if vw < 650 and vh < int(vw * 2.15):
                                corr_h = min(int(work_h - 16), int(round(vw * (832.0 / float(base_w)))))
                                user32.SetWindowPos(wintypes.HWND(hwnd), 0, vr.left, vr.top, vw, corr_h, 0x0004 | 0x0020)
                except Exception:
                    pass
            threading.Timer(0.06, _verify_restore).start()

            self._eval_js("if (window.applyFullsizeState) window.applyFullsizeState(false, false);")
            self._schedule_reapply_corners()
            return {
                "ok": True,
                "fullscreen": False,
                "is_fullscreen": False,
                "x": int(restore_x),
                "y": int(restore_y),
                "width": int(phys_w),
                "height": int(phys_h),
            }

    def set_orientation(self, landscape: bool, drawer_open: bool = None):
        """Ubah ukuran jendela ke dimensi Landscape / Horizontal atau Portrait (Tahap 67 & 71 & 75)."""
        if not self._window:
            return
        try:
            self._is_landscape = bool(landscape)
            if drawer_open is not None:
                self._drawer_open = bool(drawer_open)

            # Tahap 75 Guard: Jika sedang Full Screen, JANGAN ubah ukuran jendela OS!
            if getattr(self, "_is_fullscreen", False):
                return {"ok": True, "landscape": self._is_landscape, "fullscreen": True, "skipped_resize": True}

            if self._is_landscape:
                target_w = 1200 if self._drawer_open else 840
                target_h = 468
            else:
                dw = getattr(self, "_ideal_display_width", getattr(self, "_current_display_width", 346))
                target_w = (dw + 360) if self._drawer_open else dw
                target_h = 832

            hwnd = self._get_hwnd()
            user32 = getattr(ctypes.windll, "user32", None)
            if hwnd and user32:
                rect = wintypes.RECT()
                if user32.GetWindowRect(wintypes.HWND(hwnd), ctypes.byref(rect)):
                    if rect.left <= 5 and rect.top <= 5:
                        saved = getattr(self, "_saved_window_pos", None)
                        if saved and (saved[0] > 15 or saved[1] > 15):
                            nx, ny = int(saved[0]), int(saved[1])
                        else:
                            sw = user32.GetSystemMetrics(0)
                            sh = user32.GetSystemMetrics(1)
                            nx = max(24, (sw - target_w) // 2)
                            ny = max(24, (sh - target_h) // 2)
                        user32.SetWindowPos(wintypes.HWND(hwnd), 0, nx, ny, target_w, target_h, 0x0004 | 0x0020 | 0x0040)
                        try:
                            self._window.move(nx, ny)
                        except Exception:
                            pass

            self._window.resize(target_w, target_h)
            self._schedule_reapply_corners()

            # Cache portrait physical size when portrait and drawer closed
            if not self._is_landscape and not self._drawer_open and not getattr(self, "_is_fullscreen", False):
                if hwnd and user32:
                    rect = wintypes.RECT()
                    if user32.GetWindowRect(wintypes.HWND(hwnd), ctypes.byref(rect)):
                        cur_w = rect.right - rect.left
                        cur_h = rect.bottom - rect.top
                        if 300 <= cur_w <= 650 and cur_h >= int(cur_w * 2.15):
                            self._saved_portrait_phys_size = (int(cur_w), int(cur_h))

            return {"ok": True, "landscape": self._is_landscape, "width": target_w, "height": target_h}
        except Exception as e:
            print("set_orientation error:", e)

    def sync_device_aspect(self, display_width: int, drawer_open: bool = False):
        """Tahap 66, 67, 71 & 75: Abaikan aspect sync jika sedang mode Landscape atau Full Screen."""
        if not self._window:
            return
        if getattr(self, "_is_fullscreen", False) or getattr(self, "_is_landscape", False):
            return {"ok": True, "skipped": "fullscreen_or_landscape"}
        try:
            self._drawer_open = bool(drawer_open)
            dw = max(336, min(600, int(display_width)))
            self._ideal_display_width = dw
            self._current_display_width = dw
            target_w = dw + (360 if self._drawer_open else 0)
            target_h = 832

            hwnd = self._get_hwnd()
            user32 = getattr(ctypes.windll, "user32", None)
            if hwnd and user32:
                rect = wintypes.RECT()
                if user32.GetWindowRect(wintypes.HWND(hwnd), ctypes.byref(rect)):
                    if rect.left <= 5 and rect.top <= 5:
                        saved = getattr(self, "_saved_window_pos", None)
                        if saved and (saved[0] > 15 or saved[1] > 15):
                            nx, ny = int(saved[0]), int(saved[1])
                        else:
                            sw = user32.GetSystemMetrics(0)
                            sh = user32.GetSystemMetrics(1)
                            nx = max(24, (sw - target_w) // 2)
                            ny = max(24, (sh - target_h) // 2)
                        user32.SetWindowPos(wintypes.HWND(hwnd), 0, nx, ny, target_w, target_h, 0x0004 | 0x0020 | 0x0040)
                        try:
                            self._window.move(nx, ny)
                        except Exception:
                            pass

            self._window.resize(target_w, target_h)
            self._schedule_reapply_corners()

            # Cache portrait physical size when portrait and drawer closed
            if not self._is_landscape and not self._drawer_open and not getattr(self, "_is_fullscreen", False):
                if hwnd and user32:
                    rect = wintypes.RECT()
                    if user32.GetWindowRect(wintypes.HWND(hwnd), ctypes.byref(rect)):
                        cur_w = rect.right - rect.left
                        cur_h = rect.bottom - rect.top
                        if 300 <= cur_w <= 650 and cur_h >= int(cur_w * 2.15):
                            self._saved_portrait_phys_size = (int(cur_w), int(cur_h))

            return {"ok": True, "width": target_w, "height": target_h}
        except Exception as e:
            print("sync_device_aspect error:", e)
            return {"ok": False, "error": str(e)}

    def set_drawer(self, is_open: bool):
        """Tahap 67, 71, 75 & 91: Buka/tutup Side Drawer tanpa merusak mode Landscape atau Full Screen."""
        self._drawer_open = bool(is_open)
        if getattr(self, "_is_fullscreen", False):
            return {"ok": True, "fullscreen": True, "drawer": self._drawer_open, "drawer_open": self._drawer_open}
        if getattr(self, "_is_landscape", False):
            return self.set_orientation(True, self._drawer_open)
        dw = getattr(self, "_ideal_display_width", getattr(self, "_current_display_width", 346))
        target_w = (dw + 360) if self._drawer_open else dw
        target_h = 832
        if self._window:
            self._window.resize(target_w, target_h)
        self._schedule_reapply_corners()

        # Cache portrait physical size when drawer closed
        if not self._drawer_open and not self._is_landscape:
            hwnd = self._get_hwnd()
            user32 = getattr(ctypes.windll, "user32", None)
            if hwnd and user32:
                rect = wintypes.RECT()
                if user32.GetWindowRect(wintypes.HWND(hwnd), ctypes.byref(rect)):
                    cur_w = rect.right - rect.left
                    cur_h = rect.bottom - rect.top
                    if 300 <= cur_w <= 650 and cur_h >= int(cur_w * 2.15):
                        self._saved_portrait_phys_size = (int(cur_w), int(cur_h))

        return {"ok": True, "drawer_open": self._drawer_open, "width": target_w, "height": target_h}

    def get_window_rect(self):
        """Tahap 63 & 71: Return window x, y, width, height for wallpaper offset synchronization."""
        try:
            hwnd = self._get_hwnd()
            if hwnd:
                # [Tahap 70] moved to module top-level
                # [Tahap 70] moved to module top-level
                rect = wintypes.RECT()
                if ctypes.windll.user32.GetWindowRect(wintypes.HWND(hwnd), ctypes.byref(rect)):
                    return {
                        "x": rect.left,
                        "y": rect.top,
                        "width": rect.right - rect.left,
                        "height": rect.bottom - rect.top,
                    }
        except Exception:
            pass
        return {
            "x": getattr(self._window, "x", 0),
            "y": getattr(self._window, "y", 0),
            "width": getattr(self._window, "width", 346),
            "height": getattr(self._window, "height", 832),
        }

    def set_theme(self, theme: str):
        """Tahap 67: Update native Windows 11 DWM dark/light mode attribute & Acrylic tint."""
        is_dark = theme != "light"
        self._current_theme = theme
        try:
            from webview.platforms.winforms import BrowserView
            import System.Drawing
            import System.Windows.Forms
            for form in list(BrowserView.instances.values()):
                def _update_bg(f=form):
                    try:
                        f.BackColor = System.Drawing.Color.Black
                        f.Invalidate()
                    except Exception:
                        pass
                if hasattr(form, "InvokeRequired") and form.InvokeRequired:
                    form.Invoke(System.Windows.Forms.MethodInvoker(_update_bg))
                else:
                    _update_bg()
        except Exception:
            pass
        try:
            # [Tahap 70] moved to module top-level
            # [Tahap 70] moved to module top-level

            hwnd = self._get_hwnd()
            if hwnd:
                dwmapi = getattr(ctypes.windll, "dwmapi", None)
                user32 = getattr(ctypes.windll, "user32", None)
                if dwmapi:
                    dwmapi.DwmSetWindowAttribute(
                        wintypes.HWND(hwnd),
                        20,  # DWMWA_USE_IMMERSIVE_DARK_MODE
                        byref(c_int(1 if is_dark else 0)),
                        sizeof(c_int),
                    )
                    dwmapi.DwmSetWindowAttribute(
                        wintypes.HWND(hwnd),
                        33,  # DWMWA_WINDOW_CORNER_PREFERENCE = 2 (round)
                        byref(c_int(2)),
                        sizeof(c_int),
                    )
                    dwmapi.DwmSetWindowAttribute(
                        wintypes.HWND(hwnd),
                        38,  # DWMSBT_AUTO = 0
                        byref(c_int(0)),
                        sizeof(c_int),
                    )
                if user32 and hasattr(user32, "SetWindowCompositionAttribute"):
                    class ACCENT_POLICY(Structure):
                        _fields_ = [
                            ("AccentState", c_int),
                            ("AccentFlags", c_int),
                            ("GradientColor", c_int),
                            ("AnimationId", c_int),
                        ]
                    class WINCOMPATTRDATA(Structure):
                        _fields_ = [
                            ("Attribute", c_int),
                            ("Data", c_void_p),
                            ("SizeOfData", c_size_t),
                        ]
                    gradient_color = 0x55161412 if is_dark else 0x45F4F2F0
                    accent = ACCENT_POLICY(4, 2, gradient_color, 0)
                    data = WINCOMPATTRDATA(19, ctypes.cast(byref(accent), c_void_p), sizeof(accent))
                    user32.SetWindowCompositionAttribute(wintypes.HWND(hwnd), byref(data))
        except Exception:
            pass

    def is_pywebview(self):
        return True

    def wipe_privacy_data(self):
        """Wipe in-memory and disk privacy data via isolated server (with local fallback)."""
        try:
            return self._api_post("/api/device/wipe-privacy-data", b"{}", timeout=2.0)
        except Exception:
            from handset.screen import wipe_all_privacy_data
            return wipe_all_privacy_data()


