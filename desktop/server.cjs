const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { ORIGIN } = require("./policy.cjs");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".mp3": "audio/mpeg",
  ".webmanifest": "application/manifest+json",
};

function createWebServer(webRoot, getConfig = () => ({})) {
  const root = path.resolve(webRoot);
  return http.createServer((req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Cache-Control", "no-store");
    if (!["GET", "HEAD"].includes(req.method)) {
      res.writeHead(405).end();
      return;
    }
    if (req.headers.host !== new URL(ORIGIN).host) {
      res.writeHead(403).end();
      return;
    }
    let url, pathname;
    try {
      url = new URL(req.url, ORIGIN);
      pathname = decodeURIComponent(url.pathname);
    } catch {
      res.writeHead(400).end();
      return;
    }
    if (pathname === "/runtime-config.js") {
      res.writeHead(200, {
        "Content-Type": "text/javascript; charset=utf-8",
        "Cross-Origin-Resource-Policy": "same-origin",
      });
      res.end(
        `window.__workflowConnection = ${JSON.stringify(getConfig()).replace(/</g, "\\u003c")};`,
      );
      return;
    }
    const candidate = path.resolve(root, "." + pathname);
    if (candidate !== root && !candidate.startsWith(root + path.sep)) {
      res.writeHead(403).end();
      return;
    }
    let target = candidate;
    try {
      if (!fs.statSync(target).isFile()) target = path.join(root, "index.html");
    } catch {
      // SPA routes fall back to index; missing assets must stay 404.
      if (path.extname(pathname)) {
        res.writeHead(404).end();
        return;
      }
      target = path.join(root, "index.html");
    }
    if (!fs.existsSync(target)) {
      res.writeHead(503).end("Build the frontend before starting Workflow.");
      return;
    }
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(target)] || "application/octet-stream",
    });
    if (req.method === "HEAD") res.end();
    else
      fs.createReadStream(target)
        .on("error", () => res.destroy())
        .pipe(res);
  });
}

module.exports = { createWebServer };
