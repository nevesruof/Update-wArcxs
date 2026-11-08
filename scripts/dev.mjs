import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(fileURLToPath(import.meta.url), "..", "..");
const port = Number(process.env.PORT || 3000);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json"
};

function adapt(res) {
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (value) => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(value));
  };
  return res;
}

async function serveApi(route, req, res) {
  try {
    const module = await import(pathToFileURL(join(root, "api", `${route}.js`)).href);
    await module.default(req, adapt(res));
  } catch {
    res.statusCode = 404;
    res.end("Not found");
  }
}

async function serveFile(pathname, res) {
  const clean = normalize(pathname === "/" ? "/index.html" : pathname).replace(/^(\.\.[/\\])+/, "");
  if (clean.startsWith("/lib") || clean.startsWith("/scripts") || clean.includes(".env")) {
    res.statusCode = 404;
    return res.end("Not found");
  }

  try {
    const body = await readFile(join(root, clean));
    res.setHeader("Content-Type", TYPES[extname(clean)] || "application/octet-stream");
    res.end(body);
  } catch {
    res.statusCode = 404;
    const page = await readFile(join(root, "404.html")).catch(() => null);
    if (page) res.setHeader("Content-Type", TYPES[".html"]);
    res.end(page || "Not found");
  }
}

createServer((req, res) => {
  const { pathname } = new URL(req.url, "http://localhost");
  const api = pathname.match(/^\/api\/([\w-]+)$/);
  return api ? serveApi(api[1], req, res) : serveFile(pathname, res);
}).listen(port, () => console.log(`http://localhost:${port}`));
