const stripAnsi = require("strip-ansi");

function clean(text) {
  return stripAnsi(text);
}

module.exports = { clean };
