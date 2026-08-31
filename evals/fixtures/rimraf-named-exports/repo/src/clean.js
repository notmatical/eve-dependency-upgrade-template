const rimraf = require("rimraf");

function removeDir(path) {
  return new Promise((resolve, reject) => {
    rimraf(path, (err) => (err ? reject(err) : resolve()));
  });
}

module.exports = { removeDir };
