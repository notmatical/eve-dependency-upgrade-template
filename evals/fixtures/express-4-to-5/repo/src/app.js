const express = require("express");

function build() {
  const app = express();
  app.get("/items/:id", (req, res) => res.json({ id: req.param("id") }));
  app.del("/items/:id", (_req, res) => res.sendStatus(204));
  return app;
}

module.exports = { build };
