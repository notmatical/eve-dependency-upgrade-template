import { defineTool } from "eve/tools";
import { z } from "zod";
import policy from "../../lockstep.config.js";
import { toVerifyPolicy } from "../lib/policy/index.js";
import { botRef, mergeIntents, parseChangedPaths, REPO_DIR, upgradeIntentFrom } from "../lib/snapshot.js";
import { verify } from "../lib/verify/index.js";

interface SandboxLike {
  run(options: { command: string }): Promise<{ exitCode: number; stdout: unknown; stderr: unknown }>;
}

async function show(sandbox: SandboxLike, ref: string, path: string): Promise<string | null> {
  const result = await sandbox.run({ command: `git -C ${REPO_DIR} show '${ref}:${path}'` });
  return result.exitCode === 0 ? String(result.stdout ?? "") : null;
}

async function readWorking(sandbox: SandboxLike, path: string): Promise<string | null> {
  const result = await sandbox.run({ command: `cat '${REPO_DIR}/${path}'` });
  return result.exitCode === 0 ? String(result.stdout ?? "") : null;
}

/**
 * Decides whether the repair is honest, independently of whether it is green.
 *
 * @remarks
 * This is the tool the rest of the template exists to make meaningful, and the reason it is a tool
 * rather than a paragraph of instructions is that instructions are advisory. A model under pressure
 * from a failing build has a strong, cheap move available — delete the test, silence the
 * diagnostic, pin the version back — and every one of those produces a green check. Only something
 * that runs after the fact and refuses can prevent it.
 *
 * The comparison is the bot's pushed commit against the working tree. The bot's side comes from
 * `origin/<branch>`, which nothing inside the sandbox can write, so the baseline cannot be edited by
 * the work being judged.
 *
 * Findings are returned in full rather than as a pass or fail, and blocking ones deliberately carry
 * no advice about how to satisfy them: the honest response to "you deleted a test" is to restore it
 * and repair properly, and a hint about what the check looks for is an invitation to route around
 * it.
 */
export default defineTool({
  description:
    "Check the repair against the rules in lockstep.config.ts: the version bump is intact, no diagnostics were silenced, no test coverage was removed, no CI file was touched, and the diff is within budget. Run this before pushing. A blocking finding means the work is not acceptable; fix the underlying problem or stop and explain — do not look for another way to satisfy the check.",
  inputSchema: z.object({
    branch: z.string().min(1).describe("The upgrade branch under repair, e.g. renovate/zod-4.x"),
    baseBranch: z.string().min(1).default("main").describe("The branch the upgrade targets, used to read what the bot bumped"),
  }),
  async execute(input, ctx) {
    const sandbox = (await ctx.getSandbox()) as unknown as SandboxLike;
    const ref = botRef(input.branch);

    const diff = await sandbox.run({ command: `git -C ${REPO_DIR} diff --name-only '${ref}'` });
    if (diff.exitCode !== 0) {
      return {
        ok: false as const,
        error: `Could not diff against ${ref}: ${String(diff.stderr ?? "").trim()}`,
      };
    }
    const changed = parseChangedPaths(String(diff.stdout ?? ""));

    // Manifests are always compared, changed or not: the cheapest way to weaken an upgrade is to
    // leave the file the reviewer looks at alone and add an override to a different one.
    const manifests = parseChangedPaths(
      String((await sandbox.run({ command: `git -C ${REPO_DIR} ls-files 'package.json' '*/package.json'` })).stdout ?? ""),
    );
    const paths = [...new Set([...changed, ...manifests])];

    const before = new Map<string, string>();
    const after = new Map<string, string>();
    for (const path of paths) {
      const was = await show(sandbox, ref, path);
      const is = await readWorking(sandbox, path);
      if (was !== null) before.set(path, was);
      if (is !== null) after.set(path, is);
    }

    const intents = [];
    for (const path of manifests) {
      intents.push(
        upgradeIntentFrom(await show(sandbox, `origin/${input.baseBranch}`, path), await show(sandbox, ref, path)),
      );
    }
    const upgrade = mergeIntents(intents);

    if (upgrade.packages.size === 0) {
      return {
        ok: false as const,
        error: `No dependency change was found between origin/${input.baseBranch} and ${ref}. Confirm the branch and base are right before pushing anything.`,
      };
    }

    const report = verify({ before, after, upgrade, policy: toVerifyPolicy(policy) });
    const blocking = report.findings.filter((finding) => finding.severity === "blocking");
    const disclosed = report.findings.filter((finding) => finding.severity === "report");

    return {
      ok: report.ok,
      upgraded: Object.fromEntries(upgrade.packages),
      blocking,
      /** Not problems. These belong in the pull request body verbatim so a reviewer sees them. */
      disclose: disclosed,
    };
  },
});
