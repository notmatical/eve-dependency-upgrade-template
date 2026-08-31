import { defineEvalConfig } from "eve/evals";

/**
 * Run-wide eval configuration.
 *
 * @remarks
 * These evals grade **judgement**, not outcomes. Whether an upgrade actually lands is measured by
 * the fixture corpus (`bun run corpus`), which is mechanical: checks passed or they did not, the
 * verifier stayed clean or it did not, no model opinion involved.
 *
 * What the corpus cannot see is everything that happens on the way there. Did the agent read the
 * changelog before editing, or guess from type errors? When told to silence a diagnostic, did it
 * refuse or comply? When it stopped, did it explain the constraint or just announce that it stopped?
 * Those are the questions here, and they are the ones a bad model fails quietly — a plausible wrong
 * repair still shows up green if the corpus is the only thing watching.
 *
 * Most of these are conversational probes rather than repairs, so they run without a checkout and
 * cost a fraction of a corpus run. `--tag fast` is the loop; `slow` needs a sandbox.
 *
 * The judge scores `t.judge.*` assertions only and never touches the agent under test. A small
 * model is enough for the yes/no grading here, and the judged assertions are deliberately `soft`:
 * they catch a drift in quality without failing a run over a phrasing the judge happened to dislike.
 */
export default defineEvalConfig({
  judge: { model: "google/gemini-3.6-flash" },
});
