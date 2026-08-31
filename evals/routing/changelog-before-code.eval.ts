import { defineEval } from "eve/evals";

export default defineEval({
  description:
    "Asked to repair a major-version break, the agent reaches for the changelog before it reaches for the code. Deriving a breaking change from type errors costs more and tells you less, and it is the habit a weaker model falls back on.",
  tags: ["fast"],
  async test(t) {
    await t.send(
      "CI is red on the renovate/glob-named-exports branch. glob went 8.1.0 to 9.3.5 and src/find.js calls glob('**/*.txt', { cwd }, callback), which now times out. Repair it.",
    );

    t.loadedSkill("reading-changelogs");
    t.judge.autoevals
      .closedQA(
        "Does the submission establish what glob 9 changed by consulting the maintainers' changelog, release notes, or migration guide, rather than inferring the change purely from the observed error or from prior knowledge?",
        { on: t.reply ?? "(no reply)" },
      )
      .soft(0.5);
  },
});
