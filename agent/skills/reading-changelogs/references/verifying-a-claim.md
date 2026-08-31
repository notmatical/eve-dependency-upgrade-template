# Verifying a changelog entry before you rely on it

A changelog is evidence, not proof. It is written by hand, often at release time, sometimes wrong,
and frequently silent about the small change that happens to be the one breaking you.

Before a repair rests on an entry:

- **Check the version range.** An entry describing `4.0.0` may not be the whole story when the bot
  moved you from `3.2.1` to `4.4.3`; later releases can change it again.
- **Check it against the installed package.** The declarations under `node_modules/<pkg>` are what
  the build actually sees. If the changelog says a named export replaced another and the
  declarations disagree, believe the declarations.
- **Prefer the entry that names your symbol.** A general note about "improved ESM support" is not
  evidence about the specific export that is failing.
- **Watch for skipped majors.** A repository four majors behind has accumulated breaking changes
  that interact, and the newest guide will not mention what the oldest major removed.

When the changelog and the observed failure disagree, the failure is right. Say so in your comment:
a package whose documentation does not match its behaviour is worth flagging on its own.
