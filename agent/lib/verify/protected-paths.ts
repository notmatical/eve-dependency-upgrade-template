import type { Finding, Rule } from "./types.js";
import { changedPaths } from "./util.js";

/**
 * Fails the run when the agent edited the definition of its own success.
 *
 * @remarks
 * An agent that can change the workflow file can delete the failing job, and every other rule here
 * becomes theatre. This is the rule that makes the rest meaningful, so it has no reported tier and
 * no exceptions.
 */
export const protectedPathsUntouched: Rule = ({ before, after, policy }) => {
  const findings: Finding[] = [];
  for (const path of changedPaths(before, after)) {
    const hit = policy.protectedPaths.find((p) => (p.endsWith("/") ? path.startsWith(p) : path === p));
    if (hit) {
      findings.push({
        rule: "protected-path",
        severity: "blocking",
        path,
        message: `Modified ${hit}, which defines whether this run passes. CI is never part of the fix.`,
      });
    }
  }
  return findings;
};
