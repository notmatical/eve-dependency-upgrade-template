const test = require("node:test");
const assert = require("node:assert");
const { runAll } = require("../src/queue.js");

test("runs every task", async () => {
  const results = await runAll([async () => 1, async () => 2], 1);
  assert.deepStrictEqual(results, [1, 2]);
});
