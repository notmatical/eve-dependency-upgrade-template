const mongoose = require("mongoose");

const Thing = mongoose.model("Thing", new mongoose.Schema({ name: String }));

function findAll(callback) {
  return Thing.find({}, callback);
}

module.exports = { findAll };
