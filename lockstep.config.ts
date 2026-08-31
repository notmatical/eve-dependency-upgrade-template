import { defineLockstepPolicy } from "#lib/policy/index.js";

/**
 * What Lockstep is allowed to do in this repository.
 *
 * @remarks
 * The whole permission surface, deliberately in one file. Nothing in `agent/instructions.md` or in
 * any skill can widen it, because this agent spends its run reading changelogs and issue threads
 * written by strangers, and a permission model written in prose can be argued with in prose.
 *
 * Written to be reviewed: a change here goes through a pull request, and the diff answers "what can
 * this thing do to my repository" on its own. Every field is optional, and the values below are the
 * shipped defaults.
 */
export default defineLockstepPolicy({
  /**
   * Lockstep only ever touches branches an upgrade bot opened. A person's branch is never in scope,
   * whatever anyone asks it to do.
   */
  watch: {
    branchPrefixes: ["renovate/", "dependabot/"],
  },

  attempts: {
    /**
     * Repair attempts per pull request before it stops and asks for a person.
     *
     * @remarks
     * Attempts are counted from Lockstep's own comments on the thread, because each webhook starts
     * a fresh session with no memory of the last one and the thread is the only record they share.
     */
    maxPerPullRequest: 2,
  },

  /**
   * The mechanical checks that decide whether a green build is trustworthy. Raising these makes the
   * agent's output easier to produce and harder to believe.
   */
  verify: {
    maxChangedFiles: 40,
    maxChangedLines: 1500,
    /** Editing a test is allowed and always disclosed; deleting or disabling one never is. */
    allowTestEdits: true,
  },

  /**
   * Blast radius. `always` runs unattended, `trusted` runs unattended only for a repository
   * collaborator and asks everyone else, `approval` always asks, `never` refuses outright.
   */
  autonomy: {
    pushToBotBranch: "always",
    commentOnPullRequest: "always",
    openPullRequest: "trusted",
    /** A person decides when work is finished. Lockstep proposes; it does not ship. */
    markReadyForReview: "never",
    editHumanBranch: "never",
  },
});
