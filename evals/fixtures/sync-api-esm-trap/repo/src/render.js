const stripAnsi = require("strip-ansi");

/**
 * Synchronous by contract. Published consumers call this inline inside template literals and
 * logging calls, so it cannot become a promise without a major release of this package.
 */
function renderSync(text) {
  return stripAnsi(text).toUpperCase();
}

module.exports = { renderSync };
