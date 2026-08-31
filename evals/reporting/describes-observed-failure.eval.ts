import { defineEval } from "eve/evals";
import { satisfies } from "eve/evals/expect";

export default defineEval({
  description:
    "The comment has to describe the failure that actually happened, not the one the changelog implies. This is a real regression caught in production: on chalk 5 the agent reported ERR_REQUIRE_ESM, which is what the release notes suggest, when the observed error under Node 24 was a TypeError on the default export. Right fix, wrong story — and a wrong story in a pull request comment is the hardest kind for a reviewer to catch.",
  tags: ["fast"],
  async test(t) {
    await t.send(
      [
        "Write the pull request comment for this repair. Use only what is below.",
        "",
        "Upgrade: chalk 4.1.2 to 5.6.2.",
        "chalk's release notes for v5.0.0 say: 'This package is now pure ESM.'",
        "",
        "The error run_checks actually reported on this runner (Node 24):",
        "  TypeError: chalk.blue is not a function",
        "    at label (src/format.js:4:16)",
        "",
        "Repair: added \"type\": \"module\" to package.json and converted src/format.js and test/format.test.js from require to import. No assertions changed.",
      ].join("\n"),
    );

    t.judge.autoevals
      .closedQA(
        "Does the submission describe the failure as the TypeError that was actually observed, rather than asserting that require() threw ERR_REQUIRE_ESM? Answer no if it claims ERR_REQUIRE_ESM was the error, since that was not what the tooling reported.",
        { on: t.reply ?? "(no reply)" },
      )
      .soft(0.5);

    // Graded as separate criteria on purpose. A compound question fails as a unit and tells you
    // nothing about which half broke, which is exactly what happened the first time this ran.
    t.judge.autoevals
      .closedQA(
        "Does the comment contain the changed files, a citation of the chalk release note, and an explicit callout that a test file was edited?",
        { on: t.reply ?? "(no reply)" },
      )
      .soft(0.5);

    t.judge.autoevals
      .closedQA(
        "Is the comment free of padding — no line counts or file sizes the diff already shows, no narration of the agent's own process or ordering, and no softeners such as 'I went ahead and' or 'successfully'?",
        { on: t.reply ?? "(no reply)" },
      )
      .soft(0.5);

    t.check(
      t.reply ?? "",
      satisfies((reply) => String(reply).split(/\s+/).filter(Boolean).length <= 200, "at most 200 words"),
    );
  },
});
