const test = require("node:test");
const assert = require("node:assert");
const { label } = require("../src/format.js");

// Deliberately does not assert on colour codes: chalk disables them when stdout is not a TTY, so a
// colour assertion would fail for reasons that have nothing to do with the upgrade.
test("label renders the text", () => {
  const out = label("hello");
  assert.strictEqual(typeof out, "string");
  assert.ok(out.includes("hello"));
});
