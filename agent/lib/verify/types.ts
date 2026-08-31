/**
 * Shared vocabulary for the cheat verifier.
 *
 * @remarks
 * The verifier exists because "make CI green" is a goal an agent can satisfy dishonestly. Reverting
 * the version bump, deleting the failing test, or dropping a `@ts-ignore` on the broken line all
 * produce a green check and a worthless pull request. Instructions cannot prevent this: a prompt
 * that says "do not cheat" is a suggestion, and the model is under pressure from a failing build.
 *
 * So the rules live here as pure functions over two file snapshots instead of as prose in
 * `instructions.md`. They run after the agent finishes and before anything is pushed. A blocking
 * finding fails the attempt outright; the agent sees the finding and either fixes it properly or
 * escalates. Nothing about the outcome depends on the model's self-report.
 */

/**
 * How a finding affects the run.
 *
 * @remarks
 * `blocking` fails the attempt. `report` is surfaced in the pull request body but allowed: some
 * legitimate upgrades genuinely require touching tests or adding a package, and a verifier that
 * forbids every suspicious edit would reject most real major-version work. The honest split is to
 * block what is never legitimate and disclose what is sometimes legitimate.
 */
export type Severity = "blocking" | "report";

export interface Finding {
  /** Stable rule id, e.g. `no-new-suppressions`. Used in the PR body and asserted on in evals. */
  rule: string;
  severity: Severity;
  /** Repository-relative path, when the finding is about one file. */
  path?: string;
  /** One line, written for a human reviewing the pull request. */
  message: string;
  /** The offending text, trimmed. Quoted verbatim in the PR body so a reviewer can judge it. */
  evidence?: string;
}

/**
 * File contents at one point in time, keyed by repository-relative path.
 *
 * @remarks
 * The caller populates this with the union of paths that changed between the two commits, plus
 * every manifest file in the repository. It is deliberately not the whole tree: a monorepo would
 * be far too large to hold in memory, and no rule here needs a file that neither side touched.
 *
 * A path absent from the map means the file does not exist at that commit, which is how deletions
 * are detected.
 */
export type FileSet = ReadonlyMap<string, string>;

/**
 * What the upgrade bot asked for, parsed from its commit.
 *
 * @remarks
 * This is the contract the agent may not renegotiate. `packages` maps a dependency name to the
 * version the bot moved it to; if the manifest disagrees at the end of the run, the agent
 * downgraded something to get green, which is the single most likely cheat.
 */
export interface UpgradeIntent {
  packages: ReadonlyMap<string, string>;
}

export interface VerifyPolicy {
  /** Hard ceiling on files the agent may touch before the run escalates to a human. */
  maxChangedFiles: number;
  /** Hard ceiling on added + removed lines, same reasoning. */
  maxChangedLines: number;
  /**
   * Paths the agent may never modify, as prefixes or exact paths.
   *
   * @remarks
   * CI definitions are the obvious case: an agent that edits its own success criteria has escaped
   * the check entirely.
   */
  protectedPaths: readonly string[];
  /**
   * Whether a repair may edit an existing test.
   *
   * @remarks
   * When false, any edit to a test file blocks the run. Removing coverage is blocked either way;
   * this governs only modification, which is legitimate often enough that the default is to allow
   * it and disclose it.
   */
  allowTestEdits: boolean;
}

export const DEFAULT_POLICY: VerifyPolicy = {
  allowTestEdits: true,
  maxChangedFiles: 40,
  maxChangedLines: 1_500,
  protectedPaths: [
    ".github/workflows/",
    ".github/actions/",
    ".gitlab-ci.yml",
    ".circleci/",
    "azure-pipelines.yml",
    "Jenkinsfile",
    ".buildkite/",
    "codecov.yml",
    ".codecov.yml",
  ],
};

export interface VerifyInput {
  /** The tree as the upgrade bot left it: version bumped, build red, nothing else touched. */
  before: FileSet;
  /** The tree after the agent's repair attempt. */
  after: FileSet;
  upgrade: UpgradeIntent;
  policy?: VerifyPolicy;
}

export interface VerifyReport {
  /** True when no blocking finding fired. The pipeline pushes only on `true`. */
  ok: boolean;
  findings: readonly Finding[];
}

/** A rule is a pure function from the two snapshots to findings. */
export type Rule = (input: Required<VerifyInput>) => Finding[];
