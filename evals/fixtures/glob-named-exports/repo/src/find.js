const glob = require("glob");

function findFiles(cwd) {
  return new Promise((resolve, reject) => {
    glob("**/*.txt", { cwd }, (err, files) => (err ? reject(err) : resolve(files)));
  });
}

module.exports = { findFiles };
