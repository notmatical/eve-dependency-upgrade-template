import { z } from "zod";

/**
 * How much rope one action gets.
 *
 * @remarks
 * The four levels are ordered by blast radius, not by convenience:
 *
 * - `always` runs with no card. Correct only for actions that are reversible in one click and
 *   confined to the bot's own branch.
 * - `trusted` runs without a card for a caller the channel authorised on the signed webhook, and
 *   asks everyone else. Trust is decided at dispatch and never re-derived from anything the model
 *   can read.
 * - `approval` always pauses for a person, whoever is asking.
 * - `never` refuses and tells the model why, so it stops rather than looking for another route.
 *
 * `never` is a real setting rather than a way of saying "leave it out". An unattended run has
 * nobody to answer a card, so `approval` would park it forever; `never` fails it honestly and
 * immediately.
 */
export const AutonomyLevel = z.enum(["always", "trusted", "approval", "never"]);
export type AutonomyLevel = z.infer<typeof AutonomyLevel>;

/**
 * Paths where a change would let the agent redefine its own success.
 *
 * @remarks
 * Editing CI is the escape hatch that makes every other rule decorative: an agent that can delete
 * the failing job has a green build available to it at all times.
 */
const DEFAULT_PROTECTED_PATHS = [
  ".github/workflows/",
  ".github/actions/",
  ".gitlab-ci.yml",
  ".circleci/",
  "azure-pipelines.yml",
  "Jenkinsfile",
  ".buildkite/",
  "codecov.yml",
  ".codecov.yml",
];

export const PolicySchema = z.object({
  watch: z
    .object({
      /** Only pull requests whose head branch starts with one of these are ever touched. */
      branchPrefixes: z.array(z.string().min(1)).min(1).default(["renovate/", "dependabot/"]),
    })
    .prefault({}),

  attempts: z
    .object({
      /**
       * Repair attempts per pull request before the agent stops and asks for a person.
       *
       * @remarks
       * Two is the default because the second attempt is where the value is — the first read the
       * changelog, the second acts on what the first learned — and the third is almost always the
       * model going in circles at full token price.
       */
      maxPerPullRequest: z.number().int().min(1).max(10).default(2),
    })
    .prefault({}),

  verify: z
    .object({
      maxChangedFiles: z.number().int().min(1).default(40),
      maxChangedLines: z.number().int().min(1).default(1500),
      protectedPaths: z.array(z.string().min(1)).default(DEFAULT_PROTECTED_PATHS),
      /**
       * Whether a repair may edit existing tests.
       *
       * @remarks
       * On by default, and that is the considered choice rather than the lenient one. When a major
       * renames an export, the assertion naming it genuinely has to change, and forbidding that
       * would reject exactly the upgrades people most want handled. Removing coverage stays blocked
       * either way; this switch only governs edits, and every edited test is quoted in the pull
       * request body regardless.
       */
      allowTestEdits: z.boolean().default(true),
    })
    .prefault({}),

  autonomy: z
    .object({
      /** Pushing to the upgrade bot's own branch. Reversible, and it is not a person's branch. */
      pushToBotBranch: AutonomyLevel.default("always"),
      commentOnPullRequest: AutonomyLevel.default("always"),
      openPullRequest: AutonomyLevel.default("trusted"),
      /**
       * Marking a pull request ready for review.
       *
       * @remarks
       * Denied by default. Everything else this agent does is a proposal a person reads; this is
       * the one action that says the work is finished, and it belongs to whoever is accountable for
       * the merge.
       */
      markReadyForReview: AutonomyLevel.default("never"),
      /** Touching a branch a person owns. There is no good reason for this agent to do that. */
      editHumanBranch: AutonomyLevel.default("never"),
    })
    .prefault({}),
});

export type Policy = z.infer<typeof PolicySchema>;
export type PolicyInput = z.input<typeof PolicySchema>;
export type AutonomyAction = keyof Policy["autonomy"];
