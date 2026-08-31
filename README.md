# eve Dependency Upgrade Template

[![Agent Stack](https://img.shields.io/badge/Agent%20Stack-000?style=flat-square&logo=vercel&logoColor=FFF&labelColor=000&color=000)](https://vercel.com/kb/agent-stack)
[![MIT License](https://img.shields.io/badge/License-MIT-000?style=flat-square&logo=opensourceinitiative&logoColor=white&labelColor=000&color=000)](LICENSE)

Meet **Lockstep**, an [eve](https://eve.dev) agent that finishes the upgrades your bot starts.

Renovate and Dependabot are good at knowing an upgrade exists and bad at absorbing one. The minors
merge themselves. The majors go red, nobody has an afternoon for them, and they sit there until the
version is old enough to be a security problem and the upgrade is ten times harder. Lockstep takes
those: it reads the maintainers' changelog, runs their codemod if they published one, repairs the
call sites, and hands back a green pull request. When there is no honest repair, it says so and stops.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fnotmatical%2Feve-dependency-upgrade-template&project-name=lockstep&repository-name=lockstep&connect=%5B%7B%22type%22%3A%22github%22%2C%22env%22%3A%22GITHUB_CONNECTOR%22%2C%22triggers%22%3Atrue%2C%22triggerPath%22%3A%22%2Feve%2Fv1%2Fgithub%22%7D%5D)

## How it works

- **It rides on the bot you already run.** Renovate and Dependabot both work; your existing config,
  schedules, and grouping keep working. Lockstep waits for a failing check suite on a `renovate/` or
  `dependabot/` branch, which is the one signal on that webhook a comment cannot forge.
- **Changelog first, codemod second, compiler last.** The maintainers wrote down what they broke, and
  that is better evidence than a type error. Where a project ships a codemod for its own major,
  running it beats hand-editing what it would have done.
- **It works on the bot's branch and never opens a competing pull request.** Push, comment, done.
- **Two attempts, then it stops.** Each webhook is a fresh session with no memory, so the attempt
  count lives in the thread as comments, so a run that dies halfway still leaves its mark.
- **Merging is not in its tool surface.** Lockstep proposes; a person merges.

## What it looks like

> **chalk 4.1.2 → 5.6.2, repaired.** chalk 5 is ESM-only, so `require("chalk")` no longer yields
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
> **Look closely at:** `test/format.test.js` (edited, syntax only).
>
> Checks green · verifier clean · `7a37f5e`

## What it will not do

"Make CI green" is a goal an agent can satisfy dishonestly, and every cheap route to it produces a
green check and a worthless pull request. So these are not instructions in a prompt: a prompt that
says *do not cheat* is a suggestion competing against a failing build. They are checks in code that
run before anything is pushed, and a blocking finding fails the attempt.

| Route to a green build | |
| --- | --- |
| Downgrade the version back | blocked |
| Pin the old version through `overrides` / `resolutions` / `pnpm.overrides` | blocked |
| Silence it with `@ts-ignore`, `@ts-expect-error`, `eslint-disable`, `# noqa`, `//nolint` | blocked |
| Delete a test file, delete a case, `.skip`, `xit`, `.only` | blocked |
| Edit the CI workflow that decides whether it passed | blocked |
| Rewrite 200 files instead of upgrading | blocked, escalates to a person |
| Edit a test to match a renamed API | allowed, quoted in the comment |
| Add a package the new major requires | allowed, quoted in the comment |

The last two rows are the point. Blocking every suspicious edit would reject most real major-version
work, since a renamed export means the assertion naming it has to change too, so coverage *removal*
is blocked and coverage *modification* is disclosed. And `overrides` is the row that matters most in
practice: an agent can leave `"chalk": "5.6.2"` in plain sight, add `"overrides": { "chalk": "4.1.2" }`
underneath, and install the old package while the manifest still advertises the upgrade.

## How much of this you let it do

Autonomy is a file, not a flag. `lockstep.config.ts` is the whole answer to "what can this thing do
to my repository", and it reads the same to an engineer as to whoever has to approve it:

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

`never` is a real setting rather than an omission: an unattended run has nobody to answer an approval
card, so `approval` would park it forever and `never` fails it honestly instead.

Trust is decided once, at dispatch, from the signed webhook, and never re-derived from anything the
model can read. This agent spends its whole run reading text written by strangers. Credentials stay
in Vercel Connect, so no app id, private key, or webhook secret is reachable by the model.

## Measuring it

Claims about agents are cheap. This one ships twelve real broken upgrades (real packages, real
versions, real documented breaking changes) and grades itself against them:

```bash
bun run fixtures:check    # every fixture is green before the bump and red after
bun run fixtures:run      # runs the agent against all twelve, reports the rate
bun run eval --tag fast   # grades judgement rather than outcome
```

A fixture is valid only as a *state transition*: green at the old version, red at the new one. One
that stays green is testing nothing and gets rejected. That is how a test set quietly stops being
honest. Grading is mechanical, so there is no judge model and no rubric.

The evals ask the other half: did it read the changelog before editing, did it refuse when told to
silence a diagnostic, and when it stopped, did it explain why. A plausible wrong repair still shows
up green if outcomes are the only thing watching.

**There is no escalation fixture, and losing the one it had is the most useful thing this set has
done.** It assumed an ESM-only dependency behind a synchronous export was unrepairable. On Node 22+
that is false: `require()` loads a synchronous ESM graph, and unwrapping the default export preserves
the contract. The agent worked that out, cited the mechanism, and shipped a two-line fix. The fixture
was wrong, not the run. A genuinely unrepairable case needs top-level await. Contributions welcome.

## Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fnotmatical%2Feve-dependency-upgrade-template&project-name=lockstep&repository-name=lockstep&connect=%5B%7B%22type%22%3A%22github%22%2C%22env%22%3A%22GITHUB_CONNECTOR%22%2C%22triggers%22%3Atrue%2C%22triggerPath%22%3A%22%2Feve%2Fv1%2Fgithub%22%7D%5D)

One click. Vercel clones the repository, creates the project, and provisions a GitHub connector that
manages the App, its installation token, and inbound webhook verification. There is no app id,
private key, or webhook secret for you to hold.

Then do the one thing the button cannot do for you: **install the App on the repositories you want
covered**, from the Connect dashboard. Lockstep starts working on the next failing upgrade pull
request.

| Variable | Required | Default | What it does |
| --- | --- | --- | --- |
| `GITHUB_CONNECTOR` | No | `github/lockstep` | Connector UID, set automatically by the deploy |
| `GITHUB_APP_SLUG` | No | the App's own slug | The `@mention` name, resolved from the connector when unset |

Lockstep answers to whatever you named your App, so there is nothing to configure for mentions.

One caveat for bun repositories: Dependabot's npm updater edits `package.json` without updating
`bun.lock`, so its pull requests fail at install before any breaking change is reached. Renovate
maintains bun lockfiles and does not.

## Local development

```bash
bun install
eve link
vercel env pull
bun run dev
```

The sandbox backend is `defaultBackend()` rather than a pinned `vercel()`, so it resolves to Vercel
Sandbox when deployed and to Docker locally.

Working on the template itself? See [AGENTS.md](AGENTS.md).

## Resources

- [eve documentation](https://eve.dev/docs/introduction)
- [Vercel Connect](https://vercel.com/docs/connect)
- [Vercel Sandbox](https://vercel.com/docs/sandbox)

## Explore more templates

- [eve software factory](https://vercel.com/templates/eve/eve-software-factory)
- [eve marketing team](https://vercel.com/templates/eve/eve-marketing-team)
- [All eve templates](https://vercel.com/templates/eve)
