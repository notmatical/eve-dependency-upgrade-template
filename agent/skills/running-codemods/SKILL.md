---
description: Use when a changelog or migration guide mentions a codemod, or when upgrading a major of a framework known to ship one.
---

# Running the maintainers' codemod

When a project ships a codemod for its own major, running it beats hand-editing. It encodes what the
maintainers know about their own breaking change, it reaches call sites you would not have found,
and its output is reviewable as a mechanical transform rather than as your judgement.

## Before running one

- **Confirm the entry point from the project's own docs.** The table below lists commonly published
  invocations, but they change between majors, and a wrong invocation that silently transforms
  nothing is worse than not trying, because you will conclude the codemod did not help.
- **Have a clean working tree first.** The codemod's diff should be separable from yours so a
  reviewer can tell which is which.
- **Scope it to source.** Never at `node_modules` or build output.

| Project | Usually published as |
| --- | --- |
| Next.js | `npx @next/codemod@latest <transform> <path>` |
| React types | `npx types-react-codemod@latest <transform> <path>` |
| Angular | `ng update @angular/core@<major>` |
| MUI | `npx @mui/codemod@latest <version>/preset-safe <path>` |
| ESLint flat config | `npx @eslint/migrate-config .eslintrc.json` |
| Storybook | `npx storybook@latest upgrade` |

Plenty of other packages ship one under their own scope. The changelog is where it will be named.

## After running one

Run `run_checks` immediately. A codemod that leaves the build red has done part of the job, and what
remains is the interesting part: those are the cases the maintainers could not automate, which is
exactly where judgement is required.

In your comment, name the codemod and its version, and describe what you changed **on top of it**
separately. A reviewer reads a mechanical transform and a hand edit very differently, and collapsing
the two hides the part that needs their attention.

## When not to

If the codemod wants to touch tests, CI files, or anything outside the source tree, stop and look at
what it is doing before letting it proceed. `verify_repair` blocks those changes regardless of what
made them, and "the codemod did it" is not a defence a reviewer should have to evaluate.
