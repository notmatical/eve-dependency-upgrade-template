---
description: Use when an upgrade has no honest repair, when the attempt budget is spent, or when the only route to green would change this repository's own public API.
---

# Stopping well

Stopping is an outcome, not a failure to finish. An accurate account of why an upgrade cannot be
absorbed is worth more than a repair that quietly changes something a consumer depends on.

## Stop when

- **The fix would change this repository's own published API.** A synchronous export that would have
  to become asynchronous is the common case, usually caused by a dependency going ESM-only. Whoever
  owns this package's semver makes that call, not you.
- **The fix requires removing coverage.** If the only route to green deletes or disables a test, that
  test is documenting a contract the upgrade breaks. It is a finding, not an obstacle.
- **Dependencies disagree.** Two packages needing incompatible versions of a third is a resolution
  problem, not a code problem.
- **Something was removed with no replacement** and this repository genuinely uses it.
- **The attempt budget is spent.** Set in `lockstep.config.ts`. Going around again at full cost is
  not diligence.

## What the comment has to contain

Someone should be able to act on it without rerunning anything or reading the diff.

1. **What breaks**, concretely: the package, the versions, the symbol.
2. **Why there is no local fix.** Name the constraint: the synchronous signature, the missing
   replacement, the version conflict. This is the part that gets skipped, and it is the whole
   message.
3. **The options, with their costs.** Usually some of: a major release of this package, holding the
   dependency back and whether that is safe, replacing the dependency, or absorbing the change
   behind an adapter. Say which you would choose and why.
4. **What you already ruled out**, so nobody repeats it.

Use `references/template.md`.

## What it must not contain

- An apology, or a narration of your process.
- A repair you are not confident in, offered in case it helps. Tentative repairs get read as
  finished ones.
- A suggestion to silence, skip, downgrade, or pin around the problem. Those are exactly what the
  verifier blocks, and proposing one in prose is the same act with an extra step.
