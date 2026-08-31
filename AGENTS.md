# Working on this repository

Guidance for an AI agent editing this template. Humans may find it useful too.

## What this is

An [eve](https://eve.dev) agent that repairs the breaking changes in dependency-upgrade pull
requests. One root agent, no subagents: repairing an upgrade is a single line of reasoning, and the
changelog entry read in the first minute is what makes the type error in the fifth minute mean
anything. Splitting that across specialists with fresh context would drop the connection the work
depends on.

## The rule that matters most

**A constraint the agent must respect belongs in code, not in a prompt.**

`agent/lib/verify/` exists because "make CI green" is a goal a model can satisfy dishonestly, and an
instruction not to cheat is a suggestion competing against a failing build. The verifier's rules run
after the model finishes and before anything is pushed, and nothing about the outcome depends on the
model's self-report.

So when adding a new guard: if it can be checked mechanically, add a rule under `agent/lib/verify/`
with a test. Put it in `instructions.md` or a skill only when it genuinely cannot be.

The corollary: never weaken a verifier rule to make a run pass. If a rule fires on correct work, the
rule is wrong and the fix is a narrower rule with a test proving the correct case survives.

## Layout

| Path | What lives there |
| --- | --- |
| `agent/lib/verify/` | The cheat rules. Pure functions over two file snapshots, no I/O, heavily tested |
| `agent/lib/ecosystem/` | Per-ecosystem build commands and failure parsers. Emits commands, never runs them |
| `agent/lib/policy/` | The zod schema behind `lockstep.config.ts`, and `decide()` |
| `agent/lib/trust.ts` | The only authority on who the caller is. New capabilities gate on these predicates |
| `agent/channels/github.ts` | The whole inbound surface. `onCheckSuite` is the unattended path |
| `agent/skills/` | Procedures loaded on demand: changelogs, codemods, escalating, comments |
| `evals/fixtures/` | Twelve real broken upgrades. `scripts/check-fixtures.ts` proves each still breaks |
| `evals/*.eval.ts` | Judgement, not outcome. See `evals/evals.config.ts` for the distinction |

## Conventions

- **Doc comments explain the decision, not the mechanics.** `@remarks` should say why a choice was
  made and what the alternative cost. If a comment only restates the code, delete it.
- **Adapters emit commands; the caller executes them.** Production runs them in the eve sandbox and
  the fixture set runs them locally, and both must use the same adapter or the measured rate describes
  something other than the deployed agent.
- **Trust is decided once, at dispatch, on the signed webhook.** Never re-derive it downstream from
  anything the model can read. This agent reads third-party changelogs all run long.
- **Approval gates read the policy and the auth stamp, never tool arguments.** A gate that can be
  influenced by the thing it guards is not a gate.

## Writing a fixture

A fixture is only worth having if the bump genuinely breaks it, and ESM makes that harder to judge
than it looks. Three rules, each learned by getting it wrong:

- **Fixtures run on node, never bun.** Bun resolves `require()` of an ESM module without complaint,
  which would silently erase every ESM-only breakage in the set.
- **Under Node 24, `require(esm)` succeeds for named exports.** Only default-export consumers break,
  so several obvious-looking ESM-only candidates are not valid fixtures at all.
- **"ESM-only, therefore unrepairable" is almost always wrong.** Since Node 22 `require()` loads a
  synchronous ESM graph, and `const { default: fn } = require(...)` keeps a synchronous contract
  intact. Only top-level await genuinely blocks it, with `ERR_REQUIRE_ASYNC_MODULE`. The set lost its
  escalation fixture to exactly this mistake.

`bun run fixtures:check` catches what these rules are there to prevent: a fixture that is green at
the old version and still green at the new one is testing nothing, and is rejected.

## Before opening a pull request

```bash
bun run validate        # typecheck + unit tests
bunx eve info           # discovery must report 0 errors
bun run fixtures:check  # every fixture still green before the bump, red after
```

Changes to instructions or skills also want `bun run eval --tag fast`, which costs model calls.
Changes to the repair loop want `bun run fixtures:run`, which costs considerably more. Say so in the
pull request if you skipped it.
