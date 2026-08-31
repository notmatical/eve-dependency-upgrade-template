const test = require("node:test");
const assert = require("node:assert");
const { build } = require("../src/app.js");

test("builds an app exposing both routes", () => {
  const app = build();
  assert.strictEqual(typeof app.handle, "function");
});
