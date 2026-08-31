const test = require("node:test");
const assert = require("node:assert");
const { echo } = require("../src/run.js");

test("captures stdout", { timeout: 20000 }, async () => {
  assert.strictEqual(await echo("hi"), "hi");
});
