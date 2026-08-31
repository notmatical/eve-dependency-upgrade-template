const test = require("node:test");
const assert = require("node:assert");
const { newId } = require("../src/id.js");

test("mints a v4 uuid", () => {
  assert.match(newId(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});
