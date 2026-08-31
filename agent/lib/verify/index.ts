import { withinBudget } from "./budget.js";
import { disclosedDependencyAdditions, upgradeIntegrity } from "./manifest.js";
import { protectedPathsUntouched } from "./protected-paths.js";
import { noNewSuppressions } from "./suppressions.js";
import { testIntegrity } from "./test-integrity.js";
import { DEFAULT_POLICY, type Rule, type VerifyInput, type VerifyReport } from "./types.js";

export * from "./types.js";

const RULES: readonly Rule[] = [
  upgradeIntegrity,
  protectedPathsUntouched,
  noNewSuppressions,
  testIntegrity,
  withinBudget,
  disclosedDependencyAdditions,
];

/**
 * Runs every rule and reports what the agent actually did.
 *
 * @remarks
 * All rules always run. Stopping at the first blocking finding would make the agent's next attempt
 * a guessing game, one violation at a time; the full list lets it repair everything in one pass, or
 * lets a human see the whole picture at once when it escalates.
 */
export function verify(input: VerifyInput): VerifyReport {
  const resolved = { ...input, policy: input.policy ?? DEFAULT_POLICY };
  const findings = RULES.flatMap((rule) => rule(resolved));
  return { ok: !findings.some((f) => f.severity === "blocking"), findings };
}
