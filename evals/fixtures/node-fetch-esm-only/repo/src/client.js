const fetch = require("node-fetch");

function isReady() {
  return typeof fetch === "function";
}

module.exports = { isReady, fetch };
