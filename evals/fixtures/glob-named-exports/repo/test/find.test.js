const test = require("node:test");
const assert = require("node:assert");
const { findFiles } = require("../src/find.js");

// Bounded so a callback that is never invoked fails instead of hanging the suite forever.
test("finds seeded text files", { timeout: 5000 }, async () => {
  const found = await findFiles(__dirname);
  assert.ok(found.includes("seed.txt"));
});
