const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  ORIGIN,
  isLocalPage,
  normalizeConnection,
  normalizeNotification,
} = require("../policy.cjs");

test("only trusted loopback origin is treated as application content", () => {
  assert.equal(isLocalPage(`${ORIGIN}/calendar`), true);
  for (const url of [
    "https://evil.test",
    `${ORIGIN}.evil.test`,
    "file:///etc/passwd",
    "javascript:alert(1)",
    "http://localhost:42817",
  ])
    assert.equal(isLocalPage(url), false);
});
test("connection settings reject privileged keys and unsafe URLs", () => {
  const config = {
    supabaseUrl: "https://example.supabase.co",
    supabaseAnonKey: "sb_publishable_example",
    apiUrl: "https://backend.example.com/",
  };
  assert.equal(
    normalizeConnection(config).apiUrl,
    "https://backend.example.com",
  );
  for (const overrides of [
    { supabaseAnonKey: "sb_secret_danger" },
    { supabaseUrl: "https://supabase.co.evil.test" },
    { apiUrl: "file:///etc/passwd" },
    { supabaseAnonKey: "invalid" },
  ]) {
    assert.throws(() => normalizeConnection({ ...config, ...overrides }));
  }
  const key = [
    "e30",
    Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url"),
    "x",
  ].join(".");
  assert.throws(() => normalizeConnection({ ...config, supabaseAnonKey: key }));
});
test("malformed popup input is rejected and text length is bounded", () => {
  for (const value of [
    null,
    {},
    { id: "a", title: "" },
    { id: 4, title: "hello" },
  ])
    assert.equal(normalizeNotification(value), null);
  const item = normalizeNotification({
    id: "a",
    title: "T".repeat(500),
    body: "b".repeat(2000),
    eventId: "e",
    unknown: "discard",
  });
  assert.equal(item.title.length, 180);
  assert.equal(item.body.length, 1000);
  assert.equal(item.unknown, undefined);
  assert.equal(item.eventId, "e");
});
