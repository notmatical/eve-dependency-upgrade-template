# Escalation comment template

Adapt the wording, keep the structure. Every heading here is something a reader is looking for.

---

**`<package>` `<from>` → `<to>` cannot be absorbed automatically.**

**What breaks.** One or two sentences: the symbol, the call site, the observed failure.

**Why there is no local fix.** Name the constraint. For example: *`renderSync` is exported from this
package's index and its callers depend on it being synchronous. `strip-ansi` 7 is ESM-only, so the
only way to reach it from CommonJS is a dynamic import, which makes `renderSync` asynchronous: a
breaking change to this package's own API.*

**Options.**

| Option | Cost |
| --- | --- |
| Major release making `renderSync` async | Breaking for every consumer; needs a migration note |
| Hold `strip-ansi` at 6.x | No advisories against 6.x today; revisit if that changes |
| Convert this package to ESM | Larger change, but unblocks the next ESM-only dependency too |

One sentence on which you would choose, and why.

**Already ruled out.** What you tried, so nobody repeats it.

---
