const pLimit = require("p-limit");

async function runAll(tasks, concurrency) {
  const limit = pLimit(concurrency);
  return Promise.all(tasks.map((task) => limit(task)));
}

module.exports = { runAll };
