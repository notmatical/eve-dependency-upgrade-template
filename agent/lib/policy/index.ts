import type { SessionAuthContext } from "eve/context";
import type { VerifyPolicy } from "../verify/index.js";
import { isTrusted } from "../trust.js";
import { type AutonomyAction, type AutonomyLevel, type Policy, type PolicyInput, PolicySchema } from "./schema.js";

export * from "./schema.js";

/**
 * The decision shape eve's approval policies accept.
 *
 * @remarks
 * Declared locally rather than imported so this module stays a pure function of the policy and can
 * be tested without booting an agent. It matches eve's documented contract: `"not-applicable"`
 * proceeds, `"user-approval"` pauses for a person, and the object form refuses with a reason the
 * model reads.
 */
export type ApprovalDecision =
  | "not-applicable"
  | "user-approval"
  | { type: "denied"; reason: string };

/**
 * Validates an authored policy, filling every default.
 *
 * @remarks
 * Throws on a malformed policy rather than falling back to defaults. A typo in `lockstep.config.ts`
 * that silently degraded `markReadyForReview` from `never` to a default would be the worst possible
 * failure mode for a file whose entire job is to be the trustworthy record of what the agent may
 * do, so it fails at boot where somebody is watching.
 */
export function defineLockstepPolicy(input: PolicyInput = {}): Policy {
  const parsed = PolicySchema.safeParse(input);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `  ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(`lockstep.config.ts is not a valid policy:\n${problems}`);
  }
  return parsed.data;
}

/**
 * Resolves one action against the caller of the current turn.
 *
 * @remarks
 * The only input besides the policy is the auth stamped at dispatch. Nothing here consults tool
 * arguments, pull request bodies, changelogs, or anything else the model can influence: a
 * dependency's release notes are attacker-controllable text, and an approval decision that could be
 * argued with in prose would not be a gate.
 */
export function decide(
  policy: Policy,
  action: AutonomyAction,
  auth: SessionAuthContext | null,
): ApprovalDecision {
  const level: AutonomyLevel = policy.autonomy[action];
  if (level === "never") {
    return {
      type: "denied",
      reason: `Policy sets ${action} to "never" in lockstep.config.ts. Do not look for another route to the same effect; say what you would have done and stop.`,
    };
  }
  if (level === "always") return "not-applicable";
  if (level === "approval") return "user-approval";
  return isTrusted(auth) ? "not-applicable" : "user-approval";
}

/** Projects the policy onto the verifier's own configuration, so both read one source. */
export function toVerifyPolicy(policy: Policy): VerifyPolicy {
  return {
    maxChangedFiles: policy.verify.maxChangedFiles,
    maxChangedLines: policy.verify.maxChangedLines,
    protectedPaths: policy.verify.protectedPaths,
    allowTestEdits: policy.verify.allowTestEdits,
  };
}

/** Whether this agent is allowed to work on a branch at all. */
export function watchesBranch(policy: Policy, branch: string): boolean {
  return policy.watch.branchPrefixes.some((prefix) => branch.startsWith(prefix));
}
