import type { Finding, Rule } from "./types.js";
import { addedLines, changedPaths, evidence, isTestPath, lines } from "./util.js";

/**
 * Declarations that stop a test from running while leaving it in the file.
 *
 * @remarks
 * `.only` belongs here even though it looks like a focus tool rather than a skip: one `.only` in a
 * file silences every other test in that file, so it removes far more coverage than a `.skip` does
 * and reads as innocuous in review.
 */
const DISABLERS = [
  /\b(it|test|describe)\s*\.\s*(skip|todo|only)\s*\(/,
  /\bx(it|test|describe)\s*\(/,
  /\b(t\.Skip|t\.SkipNow)\s*\(/,
  /@(Disabled|Ignore)\b/,
  /@pytest\.mark\.(skip|xfail)/,
] as const;

/** Heuristic count of test cases declared in a file. Deliberately over-counts rather than under. */
function countCases(content: string | undefined): number {
  if (!content) return 0;
  const patterns = [/\b(it|test)\s*(\.\s*\w+)?\s*\(/g, /\bfunc\s+Test\w+\s*\(/g, /\bdef\s+test_\w+\s*\(/g];
  let total = 0;
  for (const pattern of patterns) total += content.match(pattern)?.length ?? 0;
  return total;
}

/**
 * Fails the run when coverage was removed, and discloses when tests were merely edited.
 *
 * @remarks
 * Editing a test is not a cheat. A major version that renames an exported symbol makes the old
 * assertion uncompilable, and updating it is the correct repair. Deleting the file, deleting cases,
 * or disabling them is a different act, and none of those is ever the right answer to a broken
 * upgrade. So the rule blocks removal and discloses modification, and the pull request body carries
 * the modified list so a reviewer looks at exactly the diff worth looking at.
 */
export const testIntegrity: Rule = ({ before, after, policy }) => {
  const findings: Finding[] = [];

  for (const path of changedPaths(before, after)) {
    if (!isTestPath(path)) continue;

    const beforeContent = before.get(path);
    const afterContent = after.get(path);

    if (beforeContent !== undefined && afterContent === undefined) {
      findings.push({
        rule: "test-integrity",
        severity: "blocking",
        path,
        message: "Test file was deleted. Upgrades adapt tests; they do not remove them.",
      });
      continue;
    }
    if (beforeContent === undefined) continue;

    const removed = countCases(beforeContent) - countCases(afterContent);
    if (removed > 0) {
      findings.push({
        rule: "test-integrity",
        severity: "blocking",
        path,
        message: `${removed} test case${removed === 1 ? "" : "s"} disappeared from this file.`,
      });
    }

    for (const line of addedLines(beforeContent, afterContent)) {
      if (DISABLERS.some((pattern) => pattern.test(line))) {
        findings.push({
          rule: "test-integrity",
          severity: "blocking",
          path,
          message: "Disabled a test rather than repairing it.",
          evidence: evidence(line),
        });
      }
    }

    const delta = lines(afterContent).length - lines(beforeContent).length;
    findings.push({
      rule: "test-modified",
      severity: policy.allowTestEdits ? "report" : "blocking",
      path,
      message: policy.allowTestEdits
        ? `Test file edited (${delta >= 0 ? "+" : ""}${delta} lines). Worth a close read.`
        : "Test file edited, and lockstep.config.ts sets verify.allowTestEdits to false.",
    });
  }

  return findings;
};
