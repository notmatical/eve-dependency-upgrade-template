/**
 * Proves every fixture is a real broken upgrade.
 *
 * @remarks
 * The published pass rate is only worth something if the fixture set is honest, and the way a fixture set
 * quietly stops being honest is that a fixture drifts into passing after the bump. Then the agent
 * "repairs" an upgrade that was never broken and the number goes up for free.
 *
 * So validity is defined as a state transition rather than a property of the files: green at
 * `from`, red at `to`. Anything else is rejected, including fixtures that fail at `from`, which
 * usually means the seed repository itself is broken.
 */
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const FIXTURES = new URL("../evals/fixtures/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

interface Fixture {
  package: string;
  from: string;
  to: string;
  difficulty: "easy" | "medium" | "hard";
  breaks: string;
  expect: "repair" | "escalate";
}

/** `shell: true` so Windows resolves `npm` to its shim without the caller naming the extension. */
function run(cmd: string, args: string[], cwd: string) {
  return spawnSync(cmd, args, { cwd, encoding: "utf8", shell: true });
}

function testsPass(dir: string): boolean {
  const install = run("npm", ["install", "--silent", "--no-audit", "--no-fund"], dir);
  if (install.status !== 0) return false;
  return run("node", ["--test"], dir).status === 0;
}

function setVersion(dir: string, name: string, version: string) {
  const path = join(dir, "package.json");
  const manifest = JSON.parse(readFileSync(path, "utf8"));
  for (const field of ["dependencies", "devDependencies"]) {
    if (manifest[field]?.[name]) manifest[field][name] = version;
  }
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
}

const ids = readdirSync(FIXTURES, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort();

let failed = 0;
for (const id of ids) {
  const fixture: Fixture = JSON.parse(readFileSync(join(FIXTURES, id, "fixture.json"), "utf8"));
  const work = mkdtempSync(join(tmpdir(), `fx-${id}-`));
  try {
    cpSync(join(FIXTURES, id, "repo"), work, { recursive: true });

    if (!testsPass(work)) {
      console.log(`FAIL  ${id}  seed repo is red at ${fixture.package}@${fixture.from}`);
      failed++;
      continue;
    }
    setVersion(work, fixture.package, fixture.to);
    if (testsPass(work)) {
      console.log(`FAIL  ${id}  still green at ${fixture.to}; this fixture tests nothing`);
      failed++;
      continue;
    }
    console.log(`ok    ${id}  ${fixture.package} ${fixture.from} -> ${fixture.to}  [${fixture.difficulty}/${fixture.expect}]`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

console.log(`\n${ids.length - failed}/${ids.length} fixtures valid`);
process.exit(failed > 0 ? 1 : 0);
