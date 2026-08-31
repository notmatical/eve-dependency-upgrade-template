import type { FileSet, UpgradeIntent } from "./verify/index.js";

/**
 * Where the GitHub channel checks the repository out for a turn.
 *
 * @remarks
 * The channel does this itself before the turn starts, so the agent never clones. Everything the
 * tools run is scoped to this directory with `git -C`, never a bare `cd`.
 */
export const REPO_DIR = "/workspace";

/**
 * The two commits the verifier compares.
 *
 * @remarks
 * `origin/<branch>` is the upgrade bot's work exactly as it was pushed, and the working tree is that
 * plus whatever the agent has done since. That framing is what makes the comparison trustworthy
 * without tracking state across a session: the remote is not writable from inside the sandbox, so
 * the "before" side cannot be edited by the thing being judged.
 *
 * It also survives a crash. A session that dies and is redispatched recomputes the same baseline
 * from the same remote rather than inheriting a SHA some earlier run recorded.
 */
export const botRef = (branch: string): string => `origin/${branch}`;

/** `git diff --name-only` output to paths, dropping the blank trailing line. */
export function parseChangedPaths(stdout: string): string[] {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

const DEPENDENCY_FIELDS = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"] as const;

function dependencies(manifest: string | null): Map<string, string> {
  const found = new Map<string, string>();
  if (!manifest) return found;
  try {
    const parsed = JSON.parse(manifest) as Record<string, Record<string, string> | undefined>;
    for (const field of DEPENDENCY_FIELDS) {
      for (const [name, version] of Object.entries(parsed[field] ?? {})) {
        if (typeof version === "string") found.set(name, version);
      }
    }
  } catch {
    return new Map();
  }
  return found;
}

/**
 * Derives what the upgrade bot actually asked for by diffing two manifests.
 *
 * @remarks
 * Read from the commits rather than from the pull request title or body, because those are prose:
 * a title saying "chore(deps): bump zod to 4.4.3" is a claim, and the manifest is the fact. It also
 * means the intent is unforgeable from the model's side — nothing it can write changes what the bot
 * committed.
 *
 * Only changed entries count. A manifest holds dozens of dependencies the bot never touched, and
 * treating those as part of the intent would freeze the whole dependency set for the run.
 */
export function upgradeIntentFrom(baseManifest: string | null, botManifest: string | null): UpgradeIntent {
  const before = dependencies(baseManifest);
  const after = dependencies(botManifest);
  const packages = new Map<string, string>();
  for (const [name, version] of after) {
    if (before.get(name) !== version) packages.set(name, version);
  }
  return { packages };
}

/** Merges several manifests' intents, for a monorepo where one bump spans workspaces. */
export function mergeIntents(intents: readonly UpgradeIntent[]): UpgradeIntent {
  const packages = new Map<string, string>();
  for (const intent of intents) {
    for (const [name, version] of intent.packages) packages.set(name, version);
  }
  return { packages };
}

/** Assembles the verifier's input from per-path reads the caller performed. */
export function buildFileSets(
  paths: readonly string[],
  read: (side: "before" | "after", path: string) => string | null,
): { before: FileSet; after: FileSet } {
  const before = new Map<string, string>();
  const after = new Map<string, string>();
  for (const path of paths) {
    const was = read("before", path);
    const is = read("after", path);
    if (was !== null) before.set(path, was);
    if (is !== null) after.set(path, is);
  }
  return { before, after };
}
