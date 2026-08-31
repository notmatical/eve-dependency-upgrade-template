/**
 * The seam between "how this repository builds itself" and everything else.
 *
 * @remarks
 * An adapter emits commands; it never runs them. In production the commands run inside the eve
 * sandbox, and in the eval harness they run on the local machine, so execution has to belong to the
 * caller. The important consequence is that the graded corpus exercises the same adapter production
 * does — a pass rate produced by a second, eval-only code path would measure the wrong program.
 *
 * A new ecosystem is this file implemented once. Nothing above it knows what a lockfile is.
 */

/** Minimal read access to a checkout, satisfied equally by the sandbox and the local filesystem. */
export interface FileIndex {
  has(path: string): boolean;
  read(path: string): string | null;
}

export interface CommandPlan {
  /** Shown in the pull request body and in escalation messages, so write it for a human. */
  label: string;
  command: string;
  /** A failure here means the repository is broken, not that the upgrade needs work. */
  fatal?: boolean;
}

export interface CommandOutput {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
}

export type DiagnosticKind =
  | "subpath-removed"
  | "esm-only-import"
  | "not-a-function"
  | "library-migration-error"
  | "callback-never-invoked"
  | "module-not-found"
  | "type-error"
  | "assertion-failed"
  | "unknown";

/**
 * One understood reason the build failed.
 *
 * @remarks
 * This type is the reason the agent is never handed raw logs. A failing `node --test` run prints a
 * few hundred lines, nearly all of them stack frames through the runner's own internals, and
 * putting that in context costs real money on every retry while burying the two lines that matter.
 * Parsing first means the model reasons about the failure instead of about the log format.
 *
 * `hint` carries what this class of failure usually means for a dependency upgrade specifically. It
 * is guidance, not instruction: a wrong hint should cost a little time, never a wrong repair.
 */
export interface Diagnostic {
  kind: DiagnosticKind;
  message: string;
  /** The dependency implicated, when it can be derived rather than guessed. */
  package?: string;
  /** The expression that failed, for example `chalk.blue`. */
  symbol?: string;
  file?: string;
  line?: number;
  hint?: string;
}

export interface EcosystemAdapter {
  id: string;
  detect(files: FileIndex): boolean;
  /**
   * Install, then whatever the repository uses to check itself, in the order a person would run
   * them. Cheap checks come first so an obvious break is reported without paying for the slow ones.
   */
  plan(files: FileIndex, options?: { frozen?: boolean }): CommandPlan[];
  parse(output: CommandOutput, files: FileIndex): Diagnostic[];
}
