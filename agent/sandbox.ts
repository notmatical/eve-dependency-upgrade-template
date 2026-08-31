import { defaultBackend, defineSandbox, type SandboxSessionContext } from "eve/sandbox";

/**
 * Agent sandbox configuration.
 *
 * @remarks
 * `defaultBackend()` rather than a pinned `vercel()`, and that is a deliberate divergence from the
 * other eve templates. It resolves to Vercel Sandbox when deployed and to Docker on a laptop, which
 * is what lets `bun run fixtures:run` grade the fixture set locally with no cloud account. A template
 * whose central claim is a published pass rate has to let a reader reproduce that number, and
 * "provision a Vercel project first" is enough friction to mean nobody does.
 *
 * The just-bash fallback at the end of that chain cannot run this agent: it has no real binaries, so
 * there is no git, no node, and no package manager. That is a clean failure rather than a wrong one:
 * the install step exits non-zero and `run_checks` reports it. It is also why the README asks for
 * Docker to run the fixture set.
 *
 * `onSession` marks the checkout as a safe git directory before the GitHub channel's per-turn
 * checkout runs there. The sandbox filesystem is owned by the builder uid rather than the session
 * user, and without this git aborts every command with "detected dubious ownership", the checkout
 * fails quietly, and the turn runs against an empty working tree, which this agent would
 * experience as an upgrade that mysteriously has nothing wrong with it.
 *
 * @see {@link https://vercel.com/docs/sandbox | Vercel Sandbox}
 */
export default defineSandbox({
  backend: defaultBackend(),
  async onSession({ use }: SandboxSessionContext): Promise<void> {
    const sandbox = await use();
    const result = await sandbox.run({ command: "git config --global --add safe.directory /workspace" });
    if (result.exitCode === 0) return;

    // Warn rather than throw, which is a correction: throwing here killed the whole session, and
    // most of what this agent does in a session never touches a repository. A turn spent explaining
    // why an upgrade cannot be absorbed needs no git at all, and failing it because the sandbox has
    // no git binary produces an empty reply and no explanation of why, which is exactly how this
    // was found, in an eval that died before answering.
    //
    // A sandbox that cannot run git also cannot run the repository's checks, so `run_checks` reports
    // the missing toolchain on its own, at the point where it actually matters and with the command
    // that failed attached.
    console.warn(
      `[lockstep] Could not mark /workspace as a safe git directory (exit ${result.exitCode}): ${String(result.stderr || result.stdout).trim()}. ` +
        "Repository work will fail; conversational turns are unaffected. On a laptop this usually means Docker is not running and the sandbox fell back to just-bash.",
    );
  },
});
