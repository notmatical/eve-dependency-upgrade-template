import type { SessionAuthContext } from "eve/context";

/**
 * Constructed principal for unattended repair runs.
 *
 * @remarks
 * A red check on an upgrade branch arrives with no person attached: the webhook's sender is the CI
 * app, and the pull request's author is a bot. So the turn runs as its own service principal rather
 * than borrowing an identity it did not earn. Real GitHub actors project as numeric `github:<id>`,
 * so this fixed login cannot collide with one.
 */
export const AUTONOMOUS_PRINCIPAL = "github:lockstep-upgrades";

/**
 * Auth attribute marking a caller the dispatching channel decided to trust.
 *
 * @remarks
 * Decided once, at dispatch, from the signed webhook — never re-derived downstream from anything
 * the model can read. That direction matters more here than in most agents: this one spends its
 * whole run reading changelogs and release notes written by third parties, which is exactly the
 * text an attacker would use to argue for more permission.
 */
export const TRUSTED_ATTRIBUTE = "trusted";

/** The pull request number an unattended run was dispatched from. */
export const PULL_REQUEST_ATTRIBUTE = "upgradePullRequest";

export function stampTrusted(auth: SessionAuthContext): SessionAuthContext {
  return { ...auth, attributes: { ...auth.attributes, [TRUSTED_ATTRIBUTE]: "true" } };
}

/**
 * Rewrites a channel auth into the unattended principal, carrying the pull request it belongs to.
 *
 * @remarks
 * The number is stamped so the approval policies can confine an unattended run's writes to the one
 * thread it was dispatched from. Without it, "may comment on pull requests" would mean every pull
 * request in the repository.
 */
export function stampAutonomous(auth: SessionAuthContext, pullNumber: number): SessionAuthContext {
  return {
    ...auth,
    attributes: { ...auth.attributes, [PULL_REQUEST_ATTRIBUTE]: String(pullNumber) },
    principalId: AUTONOMOUS_PRINCIPAL,
    principalType: "service",
  };
}

export function isAutonomous(auth: SessionAuthContext | null): boolean {
  return auth?.principalId === AUTONOMOUS_PRINCIPAL;
}

export function isTrusted(auth: SessionAuthContext | null): boolean {
  return auth?.attributes[TRUSTED_ATTRIBUTE] === "true";
}

/** The pull request an unattended run owns, or null when the session is not one. */
export function ownedPullRequest(auth: SessionAuthContext | null): number | null {
  if (!isAutonomous(auth)) return null;
  const stamped = auth?.attributes[PULL_REQUEST_ATTRIBUTE];
  if (typeof stamped !== "string" || stamped === "") return null;
  const number = Number(stamped);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}
