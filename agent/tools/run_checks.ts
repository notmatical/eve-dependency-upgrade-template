import { defineTool } from "eve/tools";
import { z } from "zod";
import { selectAdapter } from "../lib/ecosystem/index.js";
import type { CommandOutput, Diagnostic, FileIndex } from "../lib/ecosystem/index.js";
import { REPO_DIR } from "../lib/snapshot.js";

interface SandboxLike {
  run(options: { command: string }): Promise<{ exitCode: number; stdout: unknown; stderr: unknown }>;
}

/**
 * Loads the files an adapter needs to decide how a repository builds.
 *
 * @remarks
 * Only manifests and lockfiles, never the whole tree. An adapter's questions are all of the form
 * "which package manager, which scripts" — reading source into this cache would cost a large
 * directory walk to answer nothing.
 *
 * Read through `git show :<path>` rather than `cat` so the content is the index's, which is what
 * the verifier will later compare against.
 */
async function loadBuildFiles(sandbox: SandboxLike): Promise<FileIndex> {
  const cache = new Map<string, string>();
  const listing = await sandbox.run({
    command: `git -C ${REPO_DIR} ls-files 'package.json' '*/package.json' 'bun.lock' 'pnpm-lock.yaml' 'yarn.lock' 'package-lock.json'`,
  });

  const paths = String(listing.stdout ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const path of paths) {
    const read = await sandbox.run({ command: `git -C ${REPO_DIR} show ":${path}"` });
    if (read.exitCode === 0) cache.set(path, String(read.stdout ?? ""));
  }

  return { has: (path) => cache.has(path), read: (path) => cache.get(path) ?? null };
}

/**
 * Runs the repository's own checks and reports what broke, not what was printed.
 *
 * @remarks
 * The return value is the point of this tool. A failing suite prints hundreds of lines, nearly all
 * of them stack frames through the runner's internals, and handing that back would cost real money
 * on every iteration while burying the two lines that matter. So output is parsed into diagnostics
 * and the raw text is dropped — except for a short tail on an unrecognised failure, which is the
 * one case where the model genuinely needs to see what happened.
 *
 * Execution stops at the first failing step. The steps are ordered cheapest first, so a type error
 * is reported in seconds without paying for the suite, and a repair loop that would have run the
 * slow check five times runs it once.
 */
export default defineTool({
  description:
    "Install dependencies and run this repository's own checks in order, stopping at the first failure. Returns structured diagnostics describing what broke, not raw logs. Call this after every edit; it is the only authority on whether the upgrade builds.",
  inputSchema: z.object({}),
  async execute(_input, ctx) {
    const sandbox = (await ctx.getSandbox()) as unknown as SandboxLike;
    const files = await loadBuildFiles(sandbox);

    const adapter = selectAdapter(files);
    if (!adapter) {
      return {
        ok: false as const,
        error:
          "No ecosystem adapter recognised this repository, so its checks cannot be run. Say so plainly rather than guessing at a build command.",
      };
    }

    for (const step of adapter.plan(files)) {
      const result = await sandbox.run({ command: `cd ${REPO_DIR} && ${step.command}` });
      if (result.exitCode === 0) continue;

      const output: CommandOutput = {
        command: step.command,
        exitCode: result.exitCode,
        stdout: String(result.stdout ?? ""),
        stderr: String(result.stderr ?? ""),
      };
      const diagnostics: Diagnostic[] = adapter.parse(output, files);
      const unrecognised = diagnostics.every((d) => d.kind === "unknown");

      return {
        ok: false as const,
        step: step.label,
        command: step.command,
        fatal: step.fatal === true,
        diagnostics,
        // Only when nothing was understood: a tail is worth its tokens then, and never otherwise.
        ...(unrecognised ? { tail: `${output.stdout}\n${output.stderr}`.trim().split(/\r?\n/).slice(-40).join("\n") } : {}),
      };
    }

    return { ok: true as const, ecosystem: adapter.id };
  },
});
