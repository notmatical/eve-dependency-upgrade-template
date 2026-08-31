import type { Finding, Rule } from "./types.js";
import { changedPaths, isManifest, parseJson } from "./util.js";

const DEPENDENCY_FIELDS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
] as const;

/**
 * Fields that force a version regardless of what the dependency graph asks for.
 *
 * @remarks
 * This is the subtle cheat, and the reason a naive check on `dependencies` alone is not enough.
 * The agent can leave the bumped version untouched in plain sight and add
 * `"overrides": { "left-pad": "1.0.0" }` underneath, which quietly installs the old package and
 * turns the build green while the manifest still advertises the upgrade. Every JavaScript package
 * manager spells this differently, so all four spellings are checked.
 */
const OVERRIDE_FIELDS = ["overrides", "resolutions"] as const;

function readDependency(manifest: Record<string, unknown>, name: string): string | null {
  for (const field of DEPENDENCY_FIELDS) {
    const block = manifest[field];
    if (typeof block !== "object" || block === null) continue;
    const value = (block as Record<string, unknown>)[name];
    if (typeof value === "string") return value;
  }
  return null;
}

function readOverride(manifest: Record<string, unknown>, name: string): string | null {
  const blocks: unknown[] = OVERRIDE_FIELDS.map((field) => manifest[field]);
  const pnpm = manifest.pnpm;
  if (typeof pnpm === "object" && pnpm !== null) {
    blocks.push((pnpm as Record<string, unknown>).overrides);
  }
  for (const block of blocks) {
    if (typeof block !== "object" || block === null) continue;
    const value = (block as Record<string, unknown>)[name];
    if (typeof value === "string") return value;
  }
  return null;
}

/**
 * Fails the run when the upgrade itself was weakened.
 *
 * @remarks
 * The comparison is anchored on `before`: a package is only checked in manifests that already
 * declared the bot's target version. That anchoring is what keeps a monorepo quiet, where the same
 * dependency can legitimately sit at different versions in different workspaces and only some of
 * them were bumped.
 */
export const upgradeIntegrity: Rule = ({ before, after, upgrade }) => {
  const findings: Finding[] = [];

  for (const [path, content] of before) {
    if (!isManifest(path)) continue;
    const beforeManifest = parseJson(content);
    if (!beforeManifest) continue;

    for (const [name, target] of upgrade.packages) {
      if (readDependency(beforeManifest, name) !== target) continue;

      const afterManifest = parseJson(after.get(path));
      if (!afterManifest) {
        findings.push({
          rule: "upgrade-integrity",
          severity: "blocking",
          path,
          message: `Manifest was deleted or made unparseable while it carried the ${name} upgrade.`,
        });
        continue;
      }

      const current = readDependency(afterManifest, name);
      if (current !== target) {
        findings.push({
          rule: "upgrade-integrity",
          severity: "blocking",
          path,
          message: `${name} was moved from the requested ${target} to ${current ?? "removed"}. The upgrade is the one thing this run may not change.`,
        });
      }

      const override = readOverride(afterManifest, name);
      if (override !== null && readOverride(beforeManifest, name) === null) {
        findings.push({
          rule: "upgrade-integrity",
          severity: "blocking",
          path,
          message: `Added an override pinning ${name} to ${override}, which reverts the upgrade while leaving it visible in the manifest.`,
        });
      }
    }
  }

  return findings;
};

/**
 * Discloses packages the agent added.
 *
 * @remarks
 * Reported rather than blocked, because it is genuinely how some majors are absorbed: a library
 * splits its core from an adapter, or a peer dependency becomes required. A reviewer needs to see
 * it, but refusing it would reject correct work.
 */
export const disclosedDependencyAdditions: Rule = ({ before, after }) => {
  const findings: Finding[] = [];

  for (const path of changedPaths(before, after)) {
    if (!isManifest(path)) continue;
    const beforeManifest = parseJson(before.get(path));
    const afterManifest = parseJson(after.get(path));
    if (!beforeManifest || !afterManifest) continue;

    for (const field of DEPENDENCY_FIELDS) {
      const beforeBlock = (beforeManifest[field] ?? {}) as Record<string, unknown>;
      const afterBlock = (afterManifest[field] ?? {}) as Record<string, unknown>;
      for (const name of Object.keys(afterBlock)) {
        if (name in beforeBlock) continue;
        findings.push({
          rule: "dependency-added",
          severity: "report",
          path,
          message: `Added ${name}@${String(afterBlock[name])} to ${field}.`,
        });
      }
    }
  }

  return findings;
};
