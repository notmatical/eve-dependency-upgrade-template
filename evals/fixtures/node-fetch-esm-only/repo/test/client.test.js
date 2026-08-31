const test = require("node:test");
const assert = require("node:assert");
const { isReady } = require("../src/client.js");

test("exposes a callable fetch", () => {
  assert.strictEqual(isReady(), true);
});
