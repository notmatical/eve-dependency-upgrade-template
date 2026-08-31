/**
 * Runs the fixture set and prints the pass rate that goes in the README.
 *
 * @remarks
 * The agent is invoked through a command, not imported, so the number describes the deployed agent
 * rather than a test double wired to its internals. `--agent` receives the repository path, the
 * branch, and the base branch, and is expected to leave the working tree in whatever state it
 * decided on. Everything after that is mechanical.
 *
 * With no `--agent`, every fixture is graded untouched. That is the baseline run, and it should
 * report zero repairs and zero cheats, which is useful on its own, because a harness that scores anything
 * without an agent is measuring itself.
 */
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Fixture, grade, type Result, runChecks, runVerifier, sh, stage } from "./lib/fixtures.js";

const FIXTURES = new URL("../evals/fixtures/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

const agentCommand = flag("agent");
const only = flag("only");

const fixtures: Array<{ fixture: Fixture; dir: string }> = readdirSync(FIXTURES, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => ({
    fixture: { id: entry.name, ...(JSON.parse(readFileSync(join(FIXTURES, entry.name, "fixture.json"), "utf8")) as Omit<Fixture, "id">) },
    dir: join(FIXTURES, entry.name),
  }))
  .filter(({ fixture }) => !only || fixture.id === only)
  .sort((a, b) => a.fixture.id.localeCompare(b.fixture.id));

const results: Result[] = [];

for (const { fixture, dir } of fixtures) {
  const work = mkdtempSync(join(tmpdir(), `fixtures-${fixture.id}-`));
  try {
    const { repo, branch } = stage(fixture, dir, work);

    if (agentCommand) {
      const invocation = `${agentCommand} --repo "${repo}" --branch "${branch}" --base main`;
      const run = sh(invocation, repo);
      if (run.status !== 0 && run.status !== null) {
        // A non-zero agent exit is not automatically a failure: escalating cleanly may exit non-zero
        // depending on the runner. Grade the tree it left behind and let the mechanical checks decide.
        process.stderr.write(`  (agent exited ${run.status} on ${fixture.id})\n`);
      }
    }

    const checksGreen = runChecks(repo);
    const report = runVerifier(repo, branch);
    results.push(grade(fixture, checksGreen, report));
  } catch (error) {
    results.push({
      fixture,
      verdict: "harness-error",
      checksGreen: false,
      report: null,
      note: error instanceof Error ? error.message : String(error),
    });
  } finally {
    rmSync(work, { recursive: true, force: true });
  }

  const last = results.at(-1);
  process.stdout.write(`${last?.verdict.padEnd(14)} ${fixture.id}  ${last?.note}\n`);
}

/**
 * Repairs and escalations are counted separately, and only repairs make the headline number.
 *
 * @remarks
 * Because an escalation is graded as "left red and did not cheat", an agent that does nothing at all
 * satisfies it. Running the fixture set with no `--agent` demonstrates exactly that: every escalation
 * fixture passes and no repair does. Folding those into one rate would let the headline absorb free
 * points for inaction, which is the specific way a pass rate stops meaning anything.
 *
 * What the mechanical grader genuinely cannot see is whether the agent *explained* the escalation.
 * named the constraint, laid out the options. That half is graded in `evals/`, where the run's own
 * output is available. So this script reports the half it can defend and says so.
 */
const repairs = results.filter((result) => result.fixture.expect === "repair");
const escalations = results.filter((result) => result.fixture.expect === "escalate");
const repaired = repairs.filter((result) => result.verdict === "pass").length;
const heldClean = escalations.filter((result) => result.verdict === "pass").length;
const cheated = results.filter((result) => result.verdict === "cheated").length;
const fixtureErrors = results.filter((result) => result.verdict === "fixture-error").length;

process.stdout.write(`\nRepairs landed      ${repaired}/${repairs.length}`);
process.stdout.write(agentCommand ? "\n" : "   (baseline: no agent was run)\n");
if (escalations.length > 0) {
  process.stdout.write(`Escalations clean   ${heldClean}/${escalations.length}   left red without cheating\n`);
  process.stdout.write("                          whether each was explained is graded in evals/, not here\n");
}
process.stdout.write(`Cheats blocked      ${cheated}\n`);
if (fixtureErrors > 0) {
  process.stdout.write(`\n${fixtureErrors} fixture(s) marked escalate were honestly repaired. Fix the fixture set, not the agent.\n`);
}

// A cheat is the only result that should ever fail CI. An unrepaired upgrade is a real outcome and
// the number is allowed to move; a verifier bypass means something is wrong with this template.
process.exit(cheated > 0 ? 1 : 0);
