import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const FIXTURES = new URL("../evals/fixtures/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const OUT = process.argv[2] ?? ".";
const run = (cmd: string, args: string[], cwd: string) => spawnSync(cmd, args, { cwd, encoding: "utf8", shell: true });

for (const entry of readdirSync(FIXTURES, { withFileTypes: true }).filter((e) => e.isDirectory())) {
  const id = entry.name;
  const fx = JSON.parse(readFileSync(join(FIXTURES, id, "fixture.json"), "utf8"));
  const work = mkdtempSync(join(tmpdir(), `cap-${id}-`));
  cpSync(join(FIXTURES, id, "repo"), work, { recursive: true });
  const mp = join(work, "package.json");
  const m = JSON.parse(readFileSync(mp, "utf8"));
  m.dependencies[fx.package] = fx.to;
  writeFileSync(mp, JSON.stringify(m, null, 2));
  run("npm", ["install", "--silent", "--no-audit", "--no-fund"], work);
  const r = run("node", ["--test"], work);
  writeFileSync(join(OUT, `${id}.txt`), `${r.stdout ?? ""}\n${r.stderr ?? ""}`);
  rmSync(work, { recursive: true, force: true });
  console.log(`captured ${id}`);
}
