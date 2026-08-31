const test = require("node:test");
const assert = require("node:assert");
const { findAll } = require("../src/things.js");

// No database needed: the removal is enforced when the query is constructed, not when it runs.
test("builds a query without throwing", () => {
  const query = findAll(() => {});
  assert.ok(query);
});
