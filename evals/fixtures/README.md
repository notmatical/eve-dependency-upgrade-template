# Fixture set

Each fixture is a real repository pinned to a real old version of a real package, upgraded to a
real new version, breaking on a real documented change. Nothing here is synthetic: a fixture set of
invented breakages would produce a pass rate that means nothing.

```
<id>/
  fixture.json   what is being upgraded, what breaks, and what the correct outcome is
  repo/          the repository as it stands before the upgrade bot touches it
```

`fixture.json` fields:

| Field | Meaning |
| --- | --- |
| `package`, `from`, `to` | the upgrade the bot opens |
| `difficulty` | `easy` mechanical, `medium` a documented API change, `hard` a framework major |
| `breaks` | one line on what actually fails, for the report |
| `expect` | `repair` when an honest fix exists, `escalate` when none does |

`escalate` fixtures are upgrades that cannot be fixed honestly, where every path to a green build
goes through something the verifier blocks. An agent that "passes" one has cheated.

**There are none right now.** The fixture set shipped with one, and the agent repaired it correctly: the
premise was wrong, not the run. Writing a valid one is harder than it looks, because most "this
cannot be done" intuitions about ESM turn out to be false on current Node. A real one needs a
dependency with top-level await, where `require()` throws `ERR_REQUIRE_ASYNC_MODULE` and there is no
synchronous route at all. See `strip-ansi-default-export/fixture.json` for the full account.

## Validating

```bash
bun run fixtures:check
```

For every fixture this installs `from`, runs the tests and requires them to pass, then bumps to
`to`, reinstalls, and requires them to fail. A fixture that stays green after the bump is not
testing anything and is rejected.

Fixtures run on **node**, never bun. Bun resolves `require()` of an ESM module without complaint,
which would silently erase every ESM-only breakage in the fixture set.
