const pMap = require("p-map");

async function doubleAll(values) {
  return pMap(values, async (value) => value * 2, { concurrency: 2 });
}

module.exports = { doubleAll };
