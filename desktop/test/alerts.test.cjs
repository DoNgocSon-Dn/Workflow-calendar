const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { AlertQueue } = require("../alerts.cjs");

test("duplicate realtime notifications do not create another popup", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-alert-"));
  t.after(() => fs.rmSync(dir, { recursive: true }));
  const file = path.join(dir, "alerts.json");
  let now = 1000000;
  const queue = new AlertQueue(
    file,
    () => {},
    () => now,
  );
  const item = { id: "reminder-1", title: "Họp nhóm", body: "9:00" };
  assert.equal(queue.push(item), true);
  assert.equal(queue.push(item), false);
  assert.equal(queue.act("open", "different-id"), null);
  assert.equal(queue.pending.length, 1);
  queue.act("dismiss", item.id);
  assert.equal(queue.push(item), false);
  const restored = new AlertQueue(
    file,
    () => {},
    () => now,
  );
  assert.equal(restored.push(item), false);
});

test("snooze survives a restart and becomes visible after sleep", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-snooze-"));
  t.after(() => fs.rmSync(dir, { recursive: true }));
  const file = path.join(dir, "alerts.json");
  let now = 1000000;
  const queue = new AlertQueue(
    file,
    () => {},
    () => now,
  );
  queue.push({ id: "a", title: "Nhắc lịch" });
  queue.act("snooze", "a");
  const restored = new AlertQueue(
    file,
    () => {},
    () => now,
  );
  assert.equal(restored.pending.length, 0);
  now += 299999;
  restored.tick();
  assert.equal(restored.pending.length, 0);
  now += 2;
  restored.tick();
  assert.equal(restored.pending[0].id, "a");
  assert.equal(restored.snoozed.length, 0);
  restored.clear();
  assert.equal(restored.pending.length, 0);
  assert.equal(new AlertQueue(file, () => {}).snoozed.length, 0);
});
