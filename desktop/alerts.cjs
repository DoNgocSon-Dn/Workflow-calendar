const fs = require("node:fs");

/** Pure queue, shared by the popup and tests. No reminder expires on screen. */
class AlertQueue {
  constructor(file, onChange, now = Date.now) {
    this.file = file;
    this.onChange = onChange;
    this.now = now;
    this.pending = [];
    this.snoozed = [];
    this.seen = new Map();
    try {
      const stored = JSON.parse(fs.readFileSync(file, "utf8"));
      const valid = (n) =>
        n && typeof n.id === "string" && typeof n.title === "string";
      this.pending = (stored.pending || []).filter(valid);
      this.snoozed = (stored.snoozed || [])
        .filter((n) => valid(n.item) && Number.isFinite(n.at));
      this.seen = new Map(
        (stored.seen || []).filter(
          ([id, at]) => typeof id === "string" && at > now() - 86400000,
        ),
      );
    } catch {
      /* first run or invalid state */
    }
  }
  save() {
    try {
      const temp = this.file + ".tmp";
      fs.writeFileSync(
        temp,
        JSON.stringify({
          pending: this.pending,
          snoozed: this.snoozed,
          seen: [...this.seen],
        }),
      );
      fs.renameSync(temp, this.file);
    } catch (error) {
      console.warn("Cannot save reminders:", error.message);
    }
  }
  push(item) {
    if (
      this.seen.has(item.id) ||
      this.pending.some((n) => n.id === item.id) ||
      this.snoozed.some((n) => n.item.id === item.id)
    )
      return false;
    // Reserve capacity for accepted snoozes so resuming them never loses
    // another accepted alert, including after a restart.
    if (this.pending.length + this.snoozed.length >= 100) return false;
    this.seen.set(item.id, this.now());
    for (const [id, at] of this.seen)
      if (at < this.now() - 86400000) this.seen.delete(id);
    this.pending.push(item);
    this.save();
    this.onChange();
    return true;
  }
  act(action, id) {
    if (
      this.pending[0]?.id !== id ||
      !["open", "dismiss", "snooze"].includes(action)
    )
      return null;
    const item = this.pending.shift();
    if (action === "snooze")
      this.snoozed.push({ item, at: this.now() + 300000 });
    this.save();
    this.onChange();
    return item;
  }
  tick() {
    const due = this.snoozed.filter((n) => n.at <= this.now());
    if (!due.length) return;
    this.snoozed = this.snoozed.filter((n) => n.at > this.now());
    this.pending.push(...due.map((n) => n.item));
    this.save();
    this.onChange();
  }
  clear() {
    this.pending = [];
    this.snoozed = [];
    this.seen.clear();
    this.save();
    this.onChange();
  }
}
module.exports = { AlertQueue };
