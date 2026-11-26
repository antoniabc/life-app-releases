"""Life widget: apka Life w małym oknie bez ramki, zawsze na wierzchu (pywebview + WebView2).

Uruchomienie:  pythonw life_widget.pyw        (wymaga: pip install pywebview)
"""
import ctypes
import json
import os
import secrets
import socket
import sys
import threading
import time
import urllib.parse
import webbrowser
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

import webview

APP_URL = "https://life-timer-786a.web.app/"
CARD = (380, 660)
PILL = (300, 96)
DATA = Path(os.environ.get("LOCALAPPDATA", Path.home())) / "LifeWidget"
STATE = DATA / "window.json"
SELFTEST = "--selftest" in sys.argv

# Apka szuka window.lifeDesktop. Dokładamy też przeciąganie okna za nagłówek i pigułkę.
BRIDGE = """
(() => {
  if (window.lifeDesktop) return;
  window.lifeDesktop = {
    setMini: (v) => window.pywebview.api.set_mini(!!v),
    close: () => window.pywebview.api.close(),
    googleSignIn: () => window.pywebview.api.google_sign_in(),
  };
  const mark = () => document.querySelectorAll("header, .mini, .mini-text, .mini-text *, .account")
    .forEach((e) => e.classList.add("pywebview-drag-region"));
  new MutationObserver(mark).observe(document.body, { childList: true, subtree: true });
  mark();
  window.dispatchEvent(new Event("lifedesktop"));
})();
"""


class Api:
    def __init__(self):
        self._window = None
        self._server = None

    def _check(self):
        url = self._window.get_current_url() or ""
        if not url.startswith(APP_URL):
            raise PermissionError("forbidden")

    def set_mini(self, mini):
        self._check()
        self._window.resize(*(PILL if mini else CARD))

    def close(self):
        self._check()
        save_position(self._window)
        self._window.destroy()

    def google_sign_in(self):
        """Google nie pozwala logować w oknie wbudowanym: strona apki loguje w zwykłej przeglądarce
        i odsyła token na jednorazowy adres 127.0.0.1."""
        self._check()
        state = secrets.token_hex(16)
        got = {}

        class Handler(BaseHTTPRequestHandler):
            def do_POST(self):
                size = min(int(self.headers.get("Content-Length") or 0), 20000)
                form = urllib.parse.parse_qs(self.rfile.read(size).decode())
                if form.get("state", [""])[0] != state or not form.get("id_token"):
                    self.send_response(400)
                    self.end_headers()
                    return
                got["token"] = form["id_token"][0]
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.end_headers()
                self.wfile.write("<meta charset=utf-8><body style='font-family:Georgia;text-align:center;margin-top:20vh'>"
                                 "<h2>Zalogowano ✓</h2><p>Możesz zamknąć tę kartę i wrócić do widgetu.</p>".encode())

            def log_message(self, *a):
                pass

        server = HTTPServer(("127.0.0.1", 0), Handler)
        server.timeout = 1
        self._server = server           # nowe logowanie przerywa poprzednie czekanie
        try:
            webbrowser.open(APP_URL + "?" + urllib.parse.urlencode(
                {"widgetLogin": server.server_port, "state": state}))
            end = time.time() + 180
            while not got and time.time() < end and self._server is server:
                server.handle_request()
        finally:
            server.server_close()
        if not got:
            raise TimeoutError("nie dokończono logowania")
        return got["token"]


def load_position():
    try:
        p = json.loads(STATE.read_text(encoding="utf-8"))
        x, y = int(p["x"]), int(p["y"])
        u = ctypes.windll.user32
        left, top, width, height = (u.GetSystemMetrics(i) for i in (76, 77, 78, 79))   # wszystkie monitory
        if left - 20 <= x < left + width - 60 and top - 20 <= y < top + height - 40:
            return {"x": x, "y": y}
    except Exception:
        pass
    return {}


def save_position(window):
    try:
        DATA.mkdir(parents=True, exist_ok=True)
        STATE.write_text(json.dumps({"x": window.x, "y": window.y}), encoding="utf-8")
    except Exception:
        pass


def selftest(window):
    time.sleep(5)
    print(window.evaluate_js(
        "JSON.stringify({bridge: typeof window.lifeDesktop, url: location.origin, on_top: null,"
        " text: document.body.innerText.slice(0, 200)})"))
    window.destroy()


def main():
    # jedna kopia naraz
    lock = socket.socket()
    try:
        lock.bind(("127.0.0.1", 47813))
    except OSError:
        return
    DATA.mkdir(parents=True, exist_ok=True)
    api = Api()
    window = webview.create_window(
        "Life", APP_URL, js_api=api, width=CARD[0], height=CARD[1], min_size=PILL, frameless=True,
        easy_drag=False, on_top=True, resizable=False, background_color="#faf8fa", **load_position())
    api._window = window
    window.events.loaded += lambda: window.evaluate_js(BRIDGE)
    window.events.closing += lambda: save_position(window)
    # private_mode=False + storage_path: logowanie i dane offline zostają po zamknięciu
    webview.start(selftest if SELFTEST else None, window if SELFTEST else None,
                  private_mode=False, storage_path=str(DATA / "webview"))


if __name__ == "__main__":
    main()
