import type { Finding, Rule } from "./types.js";
import { addedLines, changedPaths } from "./util.js";

/**
 * Escalates when the repair outgrew a dependency upgrade.
 *
 * @remarks
 * A budget is a proxy for "this stopped being an upgrade and became a refactor". A run that
 * rewrites two hundred files may even be correct, but no reviewer will read it, so it is worth
 * less than an honest handoff to a person. The ceiling is policy, not a constant, because a
 * monorepo absorbing a framework major legitimately touches more than a single-package repository.
 */
export const withinBudget: Rule = ({ before, after, policy }) => {
  const paths = changedPaths(before, after);
  const findings: Finding[] = [];

  if (paths.length > policy.maxChangedFiles) {
    findings.push({
      rule: "diff-budget",
      severity: "blocking",
      message: `Touched ${paths.length} files, over the ${policy.maxChangedFiles} allowed. Hand this to a human rather than opening an unreviewable pull request.`,
    });
  }

  let changed = 0;
  for (const path of paths) {
    changed += addedLines(before.get(path), after.get(path)).length;
    changed += addedLines(after.get(path), before.get(path)).length;
  }
  if (changed > policy.maxChangedLines) {
    findings.push({
      rule: "diff-budget",
      severity: "blocking",
      message: `Changed roughly ${changed} lines, over the ${policy.maxChangedLines} allowed.`,
    });
  }

  return findings;
};
