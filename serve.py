#!/usr/bin/env python3
"""Servidor local para la copia de akryst.moe.

Sirve esta carpeta como raiz del sitio (http://localhost:8000) y emula lo
minimo que antes hacia Next.js:
  * /_next/image?url=/algo.webp  -> devuelve el archivo local equivalente
  * /bg-fallback.webp            -> bg-fallback.jpeg (el fondo de flores)
No modifica ningun archivo del sitio.
"""
import http.server, os, sys, urllib.parse

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
ALIASES = {"/bg-fallback.webp": "/bg-fallback.jpeg"}

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
    print(f"akryst -> http://localhost:{PORT}/   (Ctrl+C para cerrar)")
    http.server.ThreadingHTTPServer(("", PORT), Handler).serve_forever()
