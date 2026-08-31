import {
  defaultGitHubAuth,
  type GitHubComment,
  githubChannel,
} from "eve/channels/github";
import policy from "../../lockstep.config.js";
import { githubCredentials, mentionPattern, resolveBotName } from "../lib/github.js";
import { watchesBranch } from "../lib/policy/index.js";
import { stampAutonomous, stampTrusted } from "../lib/trust.js";

/**
 * Commenter roles allowed to start a session by mentioning the agent.
 *
 * @remarks
 * GitHub's `author_association`. Anything outside this set is an account the repository has not
 * trusted with write access, and on a public repository that is everyone.
 */
const TRUSTED_ASSOCIATIONS = new Set(["COLLABORATOR", "MEMBER", "OWNER"]);

const isIgnoredComment = (comment: GitHubComment, botName: string): boolean => {
  if (comment.body.includes("<!-- eve:github:")) return true;
  const { author } = comment;
  if (author === undefined) return false;
  return author.type === "Bot" || author.login.toLowerCase() === `${botName.toLowerCase()}[bot]`;
};

/**
 * The unattended repair task.
 *
 * @remarks
 * Written as instructions to a run that has nobody watching it. Three things are load-bearing.
 *
 * The stop-first ordering exists because webhooks are noisy: a suite that has since gone green, or
 * one belonging to a commit that is no longer the branch head, should cost one cheap read and
 * nothing else.
 *
 * The attempt comment is posted *before* the work, not after. Each dispatch is a fresh session with
 * no memory of the previous one, so the thread is the only durable record they share — and a run
 * that dies mid-repair still has to leave a mark, or the next one starts the count over and the
 * loop never breaks.
 *
 * The investigation order — changelog, then the library's own codemod, then compiler errors — is
 * the difference between a repair and a guess. A major version's breaking changes are documented
 * prose written by the people who made them; deriving the same information from type errors costs
 * more and gets less. The codemod, where one exists, is the maintainers' own answer.
 */
const REPAIR_TASK = [
  "A check suite failed on a dependency upgrade pull request opened by an upgrade bot. Your job is to make the upgrade land honestly, or to say clearly that it cannot.",
  "This run is unattended. Nobody is watching to answer a question or approve an action, so never ask a question and never attempt something that needs approval.",
  "Before anything else, read the pull request and its check runs fresh. If the checks are already green, or the failure belongs to a commit that is no longer the branch head, stop without posting anything.",
  `Then count your own earlier attempt comments on this pull request. If there are already ${policy.attempts.maxPerPullRequest}, do not try again: post one comment saying you are pausing automated repair on this pull request, that ${policy.attempts.maxPerPullRequest} attempts have not made it green, and that it needs a person. Then stop.`,
  "Otherwise post the attempt marker: a single line naming the upgrade and what looks broken, and nothing else. Post it as its own comment before you begin any work, never folded into the comment you write at the end. Later runs count these markers, and a run that dies mid-repair still has to have left its mark or the count restarts and the attempt limit never bites. Load the `writing-comments` skill for the exact shape.",
  "Now repair, and the order is not negotiable. Load the `reading-changelogs` skill and follow it before you open a single source file: the maintainers wrote down what they broke, and that is better evidence than any error you can provoke. If the changelog names a codemod for this major, load `running-codemods` and run it rather than hand-editing what it would have done. Only after that, work through what `run_checks` reports, fixing causes rather than symptoms. Reaching for the shell or the checks first and inferring the breaking change from the errors is the failure mode this ordering exists to prevent — it costs more, and it produces repairs that satisfy the compiler without matching what the library actually did.",
  "The version bump itself is not yours to change. Never downgrade it, never pin it back through an override or resolution, never silence a diagnostic with an ignore comment, never delete or disable a test, and never touch a CI workflow. `verify_repair` enforces all of this before anything is pushed, so working around it is not available to you; the only thing those routes buy is a wasted attempt.",
  "Some upgrades have no honest repair. If the only way to green would change this package's own published API — a synchronous export that would have to become asynchronous, say — that is a decision for a person, not a fix for you. Say exactly what the upgrade requires and what it would cost, and stop. Stopping with a clear explanation is a success, not a failure.",
  "When the checks pass and `verify_repair` is clean, push to the upgrade branch and post the result as a second comment. Load the `writing-comments` skill first and follow it: the reviewer can already see the diff, the file list, and the line counts, so the comment earns its space only on what broke, why you changed what you changed, and what `verify_repair` disclosed. Describe the failure your own `run_checks` reported rather than the one the changelog implies you should have seen; where they disagree, say both. Around 150 words.",
].join("\n\n");

/**
 * GitHub channel: the only way work reaches this agent.
 *
 * @remarks
 * - `onCheckSuite` is the entire unattended surface, and it is scoped three ways: the suite must
 *   have completed with a failure, it must belong to a pull request, and that pull request's head
 *   branch must match a prefix in `lockstep.config.ts`. The branch check is what keeps this off a
 *   person's work — an upgrade bot's branch prefix is the one signal available on this payload that
 *   is not model-readable and not spoofable by a comment.
 * - The turn runs under the constructed unattended principal with the pull request number stamped
 *   in, so the approval policies can confine its writes to the one thread it was dispatched from.
 *   It deliberately does not inherit the webhook sender's identity: the sender is a CI app that
 *   never agreed to any of this.
 * - `onComment` exists so a person can talk to a run in the thread — answering the pause comment,
 *   asking it to try again. It keeps eve's default mention and ignore rules and adds an
 *   authorization check, then stamps `trusted`, which is what lets `openPullRequest` proceed
 *   without a card. Mentions from anyone else are acknowledged without a session, so an arbitrary
 *   account on a public repository cannot drive the write tools.
 * - There is no `onIssue` and no `onPullRequest`. This agent has exactly one job.
 */
export default githubChannel({
  // `botName` is deliberately unset. The channel resolves it from the App's own slug, so every
  // deployment answers to whatever its owner named their App rather than to a name baked in here.
  credentials: githubCredentials,

  onCheckSuite: (ctx, suite) => {
    const raw = suite.raw as { head_branch?: unknown; check_suite?: { head_branch?: unknown } };
    const headBranch = raw.head_branch ?? raw.check_suite?.head_branch;
    const [pullNumber] = suite.pullRequests;

    if (
      suite.action !== "completed" ||
      suite.conclusion !== "failure" ||
      pullNumber === undefined ||
      typeof headBranch !== "string" ||
      !watchesBranch(policy, headBranch)
    ) {
      return null;
    }

    return {
      auth: stampAutonomous(defaultGitHubAuth(ctx), pullNumber),
      context: [REPAIR_TASK],
    };
  },

  onComment: async (ctx, comment) => {
    // An unresolvable name means the mention cannot be matched. Acknowledge without dispatching and
    // let the next event retry, rather than guessing at a handle.
    const botName = await resolveBotName().catch(() => undefined);
    if (botName === undefined) return null;

    const association = comment.raw.author_association;
    const isTrustedCommenter = typeof association === "string" && TRUSTED_ASSOCIATIONS.has(association);

    return !isIgnoredComment(comment, botName) &&
      mentionPattern(botName).test(comment.body) &&
      isTrustedCommenter
      ? { auth: stampTrusted(defaultGitHubAuth(ctx)) }
      : null;
  },
});
