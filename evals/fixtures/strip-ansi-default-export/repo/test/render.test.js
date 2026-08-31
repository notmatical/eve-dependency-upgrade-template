const test = require("node:test");
const assert = require("node:assert");
const { renderSync } = require("../src/render.js");

test("strips escapes and upcases", () => {
  assert.strictEqual(renderSync("\u001b[4mlink\u001b[0m"), "LINK");
});

// This is the contract, not an implementation detail. It is the assertion that makes the upgrade
// unfixable, and deleting it is exactly the cheat the verifier is built to catch.
test("is synchronous", () => {
  const out = renderSync("plain");
  assert.strictEqual(typeof out, "string");
  assert.strictEqual(typeof out.then, "undefined");
});
