"""Serves the dashboard locally on port 80, one site per address (only this computer can reach it):

    http://york.localhost/           the basic site (docs/, the one on GitHub Pages)
    http://advanced.york.localhost/  the advanced site (advanced/site/, when it has been built)

Chrome and Edge send every *.localhost name to this computer, so no hosts file is needed. Pages are sent with
no-store, so a normal refresh shows the latest build. Run from serve.cmd, or: python scripts/serve.py [port]
"""
import os, sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITES = {"advanced": os.path.join(ROOT, "advanced", "site"), "basic": os.path.join(ROOT, "docs")}


class Handler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        host = (self.headers.get("Host") or "").split(":")[0].lower()
        site = SITES["advanced"] if host.startswith("advanced.") else SITES["basic"]
        if not os.path.isdir(site):
            site = SITES["basic"]
        self.directory = site
        return super().translate_path(path)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 80
    sfx = "" if port == 80 else f":{port}"
    print(f"Basic:    http://york.localhost{sfx}/")
    print(f"Advanced: http://advanced.york.localhost{sfx}/" + ("" if os.path.isdir(SITES["advanced"]) else "  (not built: falls back to basic)"))
    print("Close this window (or Ctrl+C) to stop.")
    ThreadingHTTPServer(("127.0.0.1", port), partial(Handler, directory=SITES["basic"])).serve_forever()
