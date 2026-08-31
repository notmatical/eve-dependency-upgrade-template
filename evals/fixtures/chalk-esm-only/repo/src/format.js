const chalk = require("chalk");

function label(text) {
  return chalk.blue(text);
}

module.exports = { label };
