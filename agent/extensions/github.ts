import githubExtension from "@github-tools/eve-extension";
import type { Approval, ApprovalContext } from "eve/tools/approval";
import policy from "../../lockstep.config.js";
import { type AutonomyAction, decide } from "../lib/policy/index.js";
import { GITHUB_CONNECTOR } from "../lib/github.js";

/**
 * Turns one policy action into an approval predicate.
 *
 * @remarks
 * The gate reads exactly two things: the policy file, and the auth the channel stamped on the
 * signed webhook. It never looks at the tool's arguments. That is on purpose, because the arguments are
 * written by the model, and a gate that could be influenced by what it is guarding is not a gate.
 */
const gate =
  (action: AutonomyAction): Approval =>
  (ctx: ApprovalContext) =>
    decide(policy, action, ctx.session.auth.current ?? null);

/**
 * GitHub tool surface, mounted as an eve extension.
 *
 * @remarks
 * Tools reach the model as `github__<name>`, and credentials are brokered by Vercel Connect,
 * resolved per call and never exposed to it.
 *
 * There is no preset. `include` is the whole allowlist, and it is short because this agent has one
 * job: read enough of a pull request to understand a failing upgrade, and write a comment about it.
 * Everything a preset would have added (repository administration, releases, workflow mutation,
 * merging) is absent rather than gated, because a tool that does not exist cannot be talked into
 * running, and a template that ships a wide surface teaches every fork to accept one.
 *
 * `mergePullRequest` is the pointed omission. Lockstep proposes; a person merges in the GitHub UI.
 * `requireApproval` maps the remaining writes onto the actions declared in `lockstep.config.ts`, so
 * the answer to "what can this thing do to my repository" is that file and not this one.
 */
export default githubExtension({
  connector: GITHUB_CONNECTOR,
  include: [
    // Understanding the failure.
    "getRepository",
    "getFileContent",
    "getRepositoryTree",
    "listBranches",
    "listCommits",
    "getCommit",
    "compareCommits",
    "getPullRequestContext",
    "listPullRequestFiles",
    "listCheckRuns",
    "getCiFailureContext",
    // Reading its own earlier attempts on the thread, which is how the retry budget is counted.
    "listIssueComments",
    // Reporting.
    "addPullRequestComment",
    "createPullRequest",
    "updatePullRequest",
  ],
  requireApproval: {
    addPullRequestComment: gate("commentOnPullRequest"),
    createPullRequest: gate("openPullRequest"),
    // The one action that declares work finished, which is why the policy ships it as `never`.
    updatePullRequest: gate("markReadyForReview"),
  },
});
