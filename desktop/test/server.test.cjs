const { test } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createWebServer } = require("../server.cjs");

test("local server handles SPA routes, assets and guarded callbacks", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-web-"));
  fs.writeFileSync(path.join(root, "index.html"), "<h1>Workflow</h1>");
  const server = createWebServer(root, () => ({
    apiUrl: "https://backend.example.com",
  }));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(root, { recursive: true });
  });
  function request(url, host = "127.0.0.1:42817") {
    return new Promise((resolve, reject) => {
      http
        .get(
          {
            host: "127.0.0.1",
            port: server.address().port,
            path: url,
            headers: { host },
          },
          (res) => {
            let body = "";
            res.on("data", (d) => (body += d));
            res.on("end", () => resolve({ status: res.statusCode, body }));
          },
        )
        .on("error", reject);
    });
  }
  assert.equal((await request("/calendar")).body, "<h1>Workflow</h1>");
  assert.equal((await request("/missing.js")).status, 404);
  assert.equal((await request("/calendar", "evil.test")).status, 403);
  assert.equal((await request("/%2e%2e%2fsecret.txt")).status, 403);
  assert.equal((await request("/reset-password")).body, "<h1>Workflow</h1>");
  assert.match(
    (await request("/runtime-config.js")).body,
    /backend.example.com/,
  );
  assert.equal((await request("/%zz")).status, 400);
});
