import { parseJavaScriptFailure } from "./diagnostics.js";
import type { CommandPlan, EcosystemAdapter, FileIndex } from "./types.js";

type PackageManager = "bun" | "pnpm" | "yarn" | "npm";

/** Lockfile to package manager, most specific first. */
const LOCKFILES: ReadonlyArray<readonly [string, PackageManager]> = [
  ["bun.lock", "bun"],
  ["bun.lockb", "bun"],
  ["pnpm-lock.yaml", "pnpm"],
  ["yarn.lock", "yarn"],
  ["package-lock.json", "npm"],
];

function packageManager(files: FileIndex): PackageManager {
  return LOCKFILES.find(([lockfile]) => files.has(lockfile))?.[1] ?? "npm";
}

/**
 * Install command per manager.
 *
 * @remarks
 * `frozen` is off by default and that is deliberate. The lockfile arrives already updated by the
 * upgrade bot, but the moment the agent edits the manifest, say by adding the adapter package a major
 * split out, the lockfile is stale by definition, and a frozen install would fail for a
 * reason that has nothing to do with whether the repair is correct. The eval harness passes
 * `frozen: false` for the same reason.
 */
function installCommand(manager: PackageManager, frozen: boolean): string {
  if (manager === "bun") return frozen ? "bun install --frozen-lockfile" : "bun install";
  if (manager === "pnpm") return frozen ? "pnpm install --frozen-lockfile" : "pnpm install --no-frozen-lockfile";
  if (manager === "yarn") return frozen ? "yarn install --immutable" : "yarn install";
  return frozen ? "npm ci" : "npm install --no-audit --no-fund";
}

function scripts(files: FileIndex): Record<string, string> {
  const manifest = files.read("package.json");
  if (!manifest) return {};
  try {
    const parsed = JSON.parse(manifest) as { scripts?: Record<string, string> };
    return parsed.scripts ?? {};
  } catch {
    return {};
  }
}

/**
 * The JavaScript and TypeScript ecosystem.
 *
 * @remarks
 * Checks run cheapest first: a type error is found in seconds and describes the break precisely,
 * while the test suite is the slow, authoritative answer. Running the fast one first means most
 * repair iterations never pay for the slow one.
 *
 * The `node --test` fallback exists because plenty of small packages ship no test script at all,
 * and a repository whose checks cannot be run is one this agent has nothing useful to say about.
 */
export const javascript: EcosystemAdapter = {
  id: "javascript",

  detect: (files) => files.has("package.json"),

  plan(files, options) {
    const manager = packageManager(files);
    const available = scripts(files);
    const run = (script: string) => (manager === "npm" ? `npm run ${script}` : `${manager} run ${script}`);

    const steps: CommandPlan[] = [
      { label: "install", command: installCommand(manager, options?.frozen ?? false), fatal: true },
    ];

    for (const name of ["typecheck", "type-check", "tsc"]) {
      if (available[name]) {
        steps.push({ label: "typecheck", command: run(name) });
        break;
      }
    }
    if (available.build) steps.push({ label: "build", command: run("build") });
    steps.push({ label: "test", command: available.test ? run("test") : "node --test" });

    return steps;
  },

  parse: parseJavaScriptFailure,
};
