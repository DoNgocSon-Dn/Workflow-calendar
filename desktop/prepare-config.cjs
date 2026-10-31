const fs = require("node:fs");
const path = require("node:path");
const { normalizeConnection } = require("./policy.cjs");
const source = fs.readFileSync(
  path.join(__dirname, "../frontend/src/environments/environment.prod.ts"),
  "utf8",
);
const config = {};
for (const key of ["apiUrl", "supabaseUrl", "supabaseAnonKey"]) {
  const match = source.match(new RegExp(`\\b${key}:\\s*['"]([^'"]+)['"]`));
  if (!match) throw new Error(`Missing public frontend setting: ${key}`);
  config[key] = match[1];
}
fs.writeFileSync(
  path.join(__dirname, "default-config.json"),
  JSON.stringify(normalizeConnection(config), null, 2) + "\n",
);
