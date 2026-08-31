const execa = require("execa");

async function echo(text) {
  const { stdout } = await execa(process.execPath, ["-e", `process.stdout.write(${JSON.stringify(text)})`]);
  return stdout;
}

module.exports = { echo };
