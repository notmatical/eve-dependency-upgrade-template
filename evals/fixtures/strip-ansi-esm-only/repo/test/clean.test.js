const test = require("node:test");
const assert = require("node:assert");
const { clean } = require("../src/clean.js");

test("removes escape sequences", () => {
  assert.strictEqual(clean("\u001b[4mlink\u001b[0m"), "link");
});
