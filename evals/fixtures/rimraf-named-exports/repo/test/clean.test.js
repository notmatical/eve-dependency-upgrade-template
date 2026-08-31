const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { removeDir } = require("../src/clean.js");

test("removes a directory tree", { timeout: 5000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rm-"));
  fs.writeFileSync(path.join(dir, "a.txt"), "x");
  await removeDir(dir);
  assert.strictEqual(fs.existsSync(dir), false);
});
