import { describe, expect, test } from "bun:test";
import type { SessionAuthContext } from "eve/context";
import { verify } from "../verify/index.js";
import { stampAutonomous, stampTrusted } from "../trust.js";
import { decide, defineLockstepPolicy, toVerifyPolicy, watchesBranch } from "./index.js";

const base = { attributes: {}, principalId: "github:1", principalType: "user" } as unknown as SessionAuthContext;
const trusted = stampTrusted(base);
const unattended = stampAutonomous(base, 42);

describe("authoring a policy", () => {
  test("fills conservative defaults from an empty policy", () => {
    const policy = defineLockstepPolicy();
    expect(policy.autonomy.markReadyForReview).toBe("never");
    expect(policy.autonomy.editHumanBranch).toBe("never");
    expect(policy.watch.branchPrefixes).toEqual(["renovate/", "dependabot/"]);
    expect(policy.verify.allowTestEdits).toBe(true);
  });

  test("throws on a malformed policy instead of silently degrading to defaults", () => {
    expect(() => defineLockstepPolicy({ autonomy: { markReadyForReview: "sometimes" } } as never)).toThrow(
      /lockstep\.config\.ts is not a valid policy/,
    );
  });

  test("names the offending field so the error is actionable", () => {
    expect(() => defineLockstepPolicy({ attempts: { maxPerPullRequest: 99 } })).toThrow(/attempts\.maxPerPullRequest/);
  });
});

describe("resolving an action", () => {
  const policy = defineLockstepPolicy();

  test("runs an always action with no card", () => {
    expect(decide(policy, "pushToBotBranch", null)).toBe("not-applicable");
  });

  test("runs a trusted action for a collaborator and asks everyone else", () => {
    expect(decide(policy, "openPullRequest", trusted)).toBe("not-applicable");
    expect(decide(policy, "openPullRequest", base)).toBe("user-approval");
    expect(decide(policy, "openPullRequest", null)).toBe("user-approval");
  });

  test("refuses a never action with a reason the model can read", () => {
    const decision = decide(policy, "markReadyForReview", trusted);
    expect(decision).toMatchObject({ type: "denied" });
    expect(String((decision as { reason: string }).reason)).toContain("stop");
  });

  test("does not let an unattended run inherit trust it was never granted", () => {
    expect(decide(policy, "openPullRequest", unattended)).toBe("user-approval");
  });

  test("never grants more than the policy says, whatever the caller", () => {
    const locked = defineLockstepPolicy({ autonomy: { commentOnPullRequest: "never" } });
    for (const auth of [null, base, trusted, unattended]) {
      expect(decide(locked, "commentOnPullRequest", auth)).toMatchObject({ type: "denied" });
    }
  });
});

describe("branch scope", () => {
  const policy = defineLockstepPolicy();

  test.each([
    ["renovate/zod-4.x", true],
    ["dependabot/npm_and_yarn/express-5.1.0", true],
    ["main", false],
    ["feature/my-work", false],
    ["not-renovate/sneaky", false],
  ])("%s -> %p", (branch, expected) => {
    expect(watchesBranch(policy, branch)).toBe(expected);
  });
});

describe("one source of truth", () => {
  test("the verifier reads its limits from the same policy file", () => {
    const policy = defineLockstepPolicy({ verify: { maxChangedFiles: 3 } });
    expect(toVerifyPolicy(policy).maxChangedFiles).toBe(3);
  });

  test("turning off allowTestEdits promotes a test edit from disclosed to blocking", () => {
    const before = new Map([
      ["package.json", JSON.stringify({ dependencies: { zod: "4.4.3" } })],
      ["src/a.test.ts", "it('works', () => { expect(old()).toBe(1); });\n"],
    ]);
    const after = new Map(before);
    after.set("src/a.test.ts", "it('works', () => { expect(renamed()).toBe(1); });\n");
    const input = { before, after, upgrade: { packages: new Map([["zod", "4.4.3"]]) } };

    expect(verify({ ...input, policy: toVerifyPolicy(defineLockstepPolicy()) }).ok).toBe(true);
    expect(
      verify({ ...input, policy: toVerifyPolicy(defineLockstepPolicy({ verify: { allowTestEdits: false } })) }).ok,
    ).toBe(false);
  });
});
