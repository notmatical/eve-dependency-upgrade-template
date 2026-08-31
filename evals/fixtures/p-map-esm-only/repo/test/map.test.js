const test = require("node:test");
const assert = require("node:assert");
const { doubleAll } = require("../src/map.js");

test("maps with bounded concurrency", async () => {
  assert.deepStrictEqual(await doubleAll([1, 2, 3]), [2, 4, 6]);
});
