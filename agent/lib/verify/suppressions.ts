import type { Finding, Rule } from "./types.js";
import { addedLines, changedPaths, evidence } from "./util.js";

/**
 * Markers that silence a compiler, linter, or coverage gate.
 *
 * @remarks
 * These are the cheapest possible way to turn a red build green, and none of them is ever the
 * correct fix for a dependency upgrade: if a major version changed an API, the call site needs to
 * change, not the diagnostic that noticed. `@ts-expect-error` is included even though it is the
 * more disciplined of the TypeScript pair, because in this specific context it still means the
 * agent chose to record the breakage rather than repair it.
 *
 * Kept as plain substrings rather than one alternation regex so a contributor adding an ecosystem
 * can extend the list without reasoning about escaping.
 */
const SUPPRESSION_MARKERS = [
  "@ts-ignore",
  "@ts-expect-error",
  "@ts-nocheck",
  "eslint-disable",
  "biome-ignore",
  "istanbul ignore",
  "c8 ignore",
  "v8 ignore",
  "# type: ignore",
  "# noqa",
  "# pylint: disable",
  "@SuppressWarnings",
  "//nolint",
  "#[allow(",
] as const;

function markersIn(line: string): string[] {
  return SUPPRESSION_MARKERS.filter((marker) => line.includes(marker));
}

/**
 * Fails the run when the agent introduced a suppression that was not there before.
 *
 * @remarks
 * Counted per file as a multiset over added lines, so reformatting or moving existing suppressed
 * code does not register. Only genuinely new ones fire.
 */
export const noNewSuppressions: Rule = ({ before, after }) => {
  const findings: Finding[] = [];
  for (const path of changedPaths(before, after)) {
    for (const line of addedLines(before.get(path), after.get(path))) {
      for (const marker of markersIn(line)) {
        findings.push({
          rule: "no-new-suppressions",
          severity: "blocking",
          path,
          message: `Added \`${marker}\`, which hides the upgrade breakage instead of fixing it.`,
          evidence: evidence(line),
        });
      }
    }
  }
  return findings;
};
