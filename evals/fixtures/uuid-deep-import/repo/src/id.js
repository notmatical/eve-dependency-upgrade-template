const v4 = require("uuid/v4");

function newId() {
  return v4();
}

module.exports = { newId };
