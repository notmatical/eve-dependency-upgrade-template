import { defineAgent } from "eve";

/**
 * Root agent configuration.
 *
 * @remarks
 * One agent, no subagents, and that is a considered choice rather than a simplification. Repairing
 * an upgrade is a single line of reasoning: the changelog entry read in the first minute is what
 * makes the type error in the fifth minute mean something. Splitting it across specialists that
 * start with fresh context would drop exactly the connection the work depends on.
 *
 * The model tier is the one place cost and quality genuinely trade off here. A weaker model can
 * follow a codemod, but reading a migration guide and deciding whether an upgrade is repairable at
 * all is the judgement this template lives or dies on, and the escalation cases are where a cheaper
 * model fails quietly by producing a plausible wrong repair.
 */
export default defineAgent({
  compaction: { thresholdPercent: 0.9 },
  model: "anthropic/claude-sonnet-5",
});
