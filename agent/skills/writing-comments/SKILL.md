---
description: Use before posting any comment on a pull request, whether reporting a repair, marking an attempt, or escalating.
---

# Writing the comment

A reviewer opens the pull request already able to see the diff, the file list, the line counts, and
the check results. Your comment is worth its space only where it says something the page does not:
what broke, why you changed what you changed, and where to look hard.

Two comments per attempt, never one.

## The attempt marker, posted before you start

One line. Nothing else.

```
**Attempt 2.** CI red on `express` 4.21.2 → 5.1.0; `app.del` is not a function.
```

It goes up *before* the repair, not after, and this is not a stylistic preference. Every dispatch is
a fresh session that remembers nothing, so these comments are the only record of how many attempts
have happened. A run that dies halfway must still have left its mark, or the next run counts zero
and the limit never bites.

## The result, posted when you are done

A hard ceiling of 200 words, and 150 is the target. If you are over, cut in this order: the
explanatory sentence first, then detail from the file table. Never cut the disclosure line — a
shorter comment that hides an edited test is worse than a long one.

Structure:

1. **One bold line: the upgrade, the verdict, and the cause.** `**chalk 4.1.2 → 5.6.2 — repaired.**`
   followed by one sentence on what actually broke.
2. **A table of changed files**, one short phrase each. Group generated files into a single row.
3. **Your source**, in one line: the changelog entry, release note, or codemod you relied on, named
   precisely enough to check. If nothing was published, say that instead.
4. **"Look closely at:"** — everything `verify_repair` disclosed. Edited tests and added packages,
   each in a few words. This is the most valuable line in the comment; never drop it.
5. **Any judgement you made** that a reasonable person could disagree with. One sentence.
6. **A closing status line**: checks, verifier, and the pushed sha.

## Cut

- Line counts, file sizes, and anything else the diff already renders.
- Restating a tool's output after you have already summarised it.
- Narrating your process, your ordering, or what you tried first.
- Long quotations from a changelog. Cite it; do not paste it.
- Softeners and throat-clearing: "I went ahead and", "it's worth noting that", "successfully".

## Describe the failure you observed

State the error your own `run_checks` reported, not the one the changelog suggests you should have
seen. Those differ more often than you would expect — a package documented as breaking one way can
fail another on a given runtime — and a comment that describes a plausible failure instead of the
real one is wrong in the way that is hardest for a reviewer to catch.

If the changelog and the observed failure disagree, say both. That disagreement is useful.
