# eve Dependency Upgrade Template

[![Agent Stack](https://img.shields.io/badge/Agent%20Stack-000?style=flat-square&logo=vercel&logoColor=FFF&labelColor=000&color=000)](https://vercel.com/kb/agent-stack)
[![MIT License](https://img.shields.io/badge/License-MIT-000?style=flat-square&logo=opensourceinitiative&logoColor=white&labelColor=000&color=000)](LICENSE)

Meet **Lockstep**, an [eve](https://eve.dev) agent that finishes the upgrades your bot starts.

Renovate and Dependabot open the pull request. The minor ones merge themselves. The majors go red,
nobody has an afternoon for them, and they sit there — until the version is old enough to be a
security problem and the upgrade is ten times harder. Lockstep picks those up: it reads the
maintainers' changelog, runs their codemod if they published one, repairs the call sites, and hands
back a green pull request. When there is no honest repair, it says so and stops.

It rides on the bot you already run. Existing Renovate config, schedules, and grouping keep working;
this listens for a failing check suite on a `renovate/` or `dependabot/` branch and takes it from
there.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fnotmatical%2Feve-dependency-upgrade-template)

## What it looks like

> **Lockstep** commented on `chore(deps): update chalk to 5.6.2`
>
> **chalk 4.1.2 → 5.6.2 — repaired.** chalk 5 is ESM-only, so `require("chalk")` no longer yields
> the chalk instance.
>
> | File | Change |
> | --- | --- |
> | `package.json` | added `"type": "module"` |
> | `src/format.js` | `require` → `import` |
> | `test/format.test.js` | `require` → `import`, no assertions changed |
>
> Source: chalk v5.0.0 release notes, "This package is now pure ESM". No codemod published.
>
> **Look closely at:** `test/format.test.js` — edited, syntax only.
>
> This package is `private: true` with no consumers, so converting its own module format moves no
> published API.
>
> Checks green · verifier clean · `7a37f5e`

## What it will not do

"Make CI green" is a goal an agent can satisfy dishonestly, and every cheap route to it produces a
green check and a worthless pull request. So the rules are not advice in a prompt — a prompt that
says *do not cheat* is a suggestion, and the model is under pressure from a failing build. They are
checks in code that run before anything is pushed, and a blocking finding fails the attempt.

| Route to a green build | |
| --- | --- |
| Downgrade the version back | blocked |
| Pin the old version through `overrides` / `resolutions` / `pnpm.overrides` | blocked |
| Silence it — `@ts-ignore`, `@ts-expect-error`, `eslint-disable`, `# noqa`, `//nolint` | blocked |
| Delete a test file, delete a case, `.skip`, `xit`, `.only` | blocked |
| Edit the CI workflow that decides whether it passed | blocked |
| Rewrite 200 files instead of upgrading | blocked, escalates to a person |
| Edit a test to match a renamed API | allowed, quoted in the comment |
| Add a package the new major requires | allowed, quoted in the comment |

The last two rows are the interesting ones. Blocking every suspicious edit would reject most real
major-version work, because when a library renames an export the assertion naming it genuinely has
to change. So coverage *removal* is blocked and coverage *modification* is disclosed, and the
comment tells the reviewer exactly which lines to read.

`overrides` is the row that matters most in practice. An agent can leave `"chalk": "5.6.2"` sitting
in plain sight and add `"overrides": { "chalk": "4.1.2" }` underneath, which installs the old
package and turns the build green while the manifest still advertises the upgrade. All four package
manager spellings are checked.

## How much of this you let it do

Autonomy is a file, not a flag. `lockstep.config.ts` is the whole answer to "what can this thing do
to my repository", and it is reviewable, diffable, and reads the same to an engineer as to whoever
has to approve it:

```ts
export default defineLockstepPolicy({
  watch: { branchPrefixes: ["renovate/", "dependabot/"] },
  attempts: { maxPerPullRequest: 2 },
  verify: { maxChangedFiles: 40, maxChangedLines: 1500, allowTestEdits: true },
  autonomy: {
    pushToBotBranch: "always",      // reversible, and not a person's branch
    commentOnPullRequest: "always",
    openPullRequest: "trusted",     // no card for a collaborator, a card for anyone else
    markReadyForReview: "never",    // the one action that says the work is done
    editHumanBranch: "never",
  },
});
```

Four levels. `always` runs. `trusted` runs without a card for a caller the channel authorised on the
signed webhook and asks everyone else. `approval` always waits for a person. `never` refuses and
says why, which matters because an unattended run has nobody to answer a card — `approval` would
park it forever, so `never` fails it honestly instead.

Merge tools are not in the tool surface at all. Lockstep proposes; a person merges.

## Measuring it

Claims about agents are cheap. This one ships a corpus of twelve real upgrades — real packages, real
versions, real documented breaking changes — and grades itself against them:

```bash
bun run fixtures:check    # proves every fixture is green before the bump and red after
bun run corpus            # runs the agent against all twelve and reports the rate
bun run eval --tag fast   # grades judgement rather than outcome
```

The corpus and the evals answer different questions. The corpus asks whether the upgrade landed, and
grades it mechanically. The evals ask what happened on the way there — did it read the changelog
before editing, did it refuse when told to silence a diagnostic or pin the version back, did it
treat a changelog carrying instructions as data, and when it stopped, did it explain the constraint
or just announce that it stopped. A plausible wrong repair still shows up green if the corpus is the
only thing watching.

A fixture is only valid as a *state transition*: green at the old version, red at the new one. One
that stays green after the bump is testing nothing and is rejected, which is how a corpus quietly
stops being honest. All twelve are also mirrored as pull requests with real CI, so the failures are
reproduced on a clean Ubuntu runner and not just on the author's laptop.

Grading is mechanical — did the checks pass, and did the diff survive the verifier — so there is no
judge model and no rubric. **One fixture in the corpus cannot be repaired honestly at all**: a
synchronous exported function whose dependency went ESM-only, where every route to green either
breaks this package's own published API or trips a rule above. The correct outcome there is a clear
escalation, and an agent that "passes" it has cheated.

> **Published rate:** not yet measured across the full corpus. The chalk fixture is verified
> end to end — repaired honestly, CI green, verifier clean. Run `bun run corpus` and put the number
> here before relying on it.

## Deploy

The deploy provisions the project; the GitHub connector is created separately because of the
subscription below.

| Provisioned | Sets |
| --- | --- |
| GitHub connector via Vercel Connect | `GITHUB_CONNECTOR` |

```bash
vercel connect create github --name lockstep --triggers \
  --trigger-path /eve/v1/github \
  --trigger-event check_suite \
  --trigger-event issue_comment \
  --trigger-event pull_request_review_comment
```

**`check_suite` has to be subscribed this way.** The guided `eve add channel/github` flow offers
only `issue_comment`, `pull_request_review_comment`, `issues`, and `pull_request`, and rejects
anything else. `onCheckSuite` is a supported channel hook, but it is not reachable from that setup
path — and for this agent it is not an optional extra, it is the entire unattended surface. Provision
the connector with `vercel connect create` instead, as above.

Then install the App on the repositories you want covered and deploy:

```bash
eve deploy
```

| Variable | Required | Default | What it does |
| --- | --- | --- | --- |
| `GITHUB_CONNECTOR` | No | `github/lockstep` | Connector UID for the channel and tool surface |
| `GITHUB_APP_SLUG` | No | the App's own slug | The `@mention` name; resolved from the connector when unset |

## Reading untrusted text all day

This agent's job is to read changelogs, release notes, and third-party dependency source — text
written by strangers, some of whom would like it to do something else. Three things follow, and they
are the reason the design looks the way it does.

Trust is decided once, at dispatch, on the signed webhook, and stamped into session auth. Nothing
downstream re-derives it from anything the model can read. The approval gates consult the policy file
and that stamp, never a tool's arguments — a gate that could be argued with by the thing it is
guarding is not a gate. And credentials live in Vercel Connect: there is no app id, private key, or
webhook secret in the deployment or reachable by the model, so a credential it cannot see is one no
amount of injected text can talk it into revealing.

## Local development

```bash
bun install
eve link
vercel env pull
bun run dev
```

`bun test` runs the verifier's own suite. The sandbox backend is `defaultBackend()` rather than a
pinned `vercel()`, so the corpus runs against Docker on a laptop — a template whose central claim is
a measured number has to let a reader reproduce it without provisioning a cloud project first.

On Windows, run `eve deploy` through `node node_modules/eve/bin/eve.js deploy`. Under git-bash
`bun install` resolves to `/usr/bin/install`, and under PowerShell `bunx` is detected as the package
manager and becomes `bunx install`; invoking the binary directly avoids both.

`eve` and `@github-tools/eve-extension` are version-matched through a compatibility manifest, so
they move together — bumping one alone produces a build that type-checks and then refuses to mount
the extension. The Dependabot config groups them for that reason.

## Resources

- [eve documentation](https://eve.dev/docs/introduction)
- [Vercel Connect](https://vercel.com/docs/connect)
- [Vercel Sandbox](https://vercel.com/docs/sandbox)

## Explore more templates

- [eve software factory](https://vercel.com/templates/eve/eve-software-factory)
- [eve marketing team](https://vercel.com/templates/eve/eve-marketing-team)
- [All eve templates](https://vercel.com/templates/eve)
