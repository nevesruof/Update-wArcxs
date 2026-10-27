#!/usr/bin/env python3
import http.server, os, sys, urllib.parse

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
ALIASES = {
    "/bg-fallback.webp": "/images/bg-fallback.jpeg",
    "/photos": "/pages/photos.html",
    "/admin": "/pages/admin.html",
}

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def translate_path(self, path):
        parsed = urllib.parse.urlparse(path)
        p = urllib.parse.unquote(parsed.path)
        if p == "/_next/image":
            p = urllib.parse.parse_qs(parsed.query).get("url", ["/"])[0]
        p = ALIASES.get(p, p)
        return super().translate_path(p)

if __name__ == "__main__":
    print(f"Take -> http://localhost:{PORT}/   (Ctrl+C para cerrar)")
    http.server.ThreadingHTTPServer(("", PORT), Handler).serve_forever()
