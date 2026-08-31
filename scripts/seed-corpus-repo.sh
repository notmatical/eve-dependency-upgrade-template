#!/usr/bin/env bash
# Publishes the fixture corpus to a GitHub repository as real upgrade pull requests.
#
# Each fixture becomes two orphan branches: base/<id> holding the repository at the old version,
# and renovate/<id> adding exactly one commit that bumps it. Orphan branches are what let twelve
# unrelated mini-repositories share one repository without colliding.
#
# The pull request between them is what the agent actually sees in production: a failing check
# suite on a branch whose prefix marks it as an upgrade bot's work.
set -euo pipefail

REPO_URL="${1:?usage: seed-corpus-repo.sh <git-url>}"
FIXTURES="$(cd "$(dirname "${BASH_SOURCE[0]}")/../evals/fixtures" && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

git init -q "$WORK"
cd "$WORK"
git remote add origin "$REPO_URL"
git config user.name "notmatical"
git config user.email "notmatical@users.noreply.github.com"

# Runs on every branch so the base branch proves green before the upgrade branch proves red.
# Pinned to Node 24 because the corpus depends on modern require(esm) semantics: on an older
# runtime several fixtures would fail for the wrong reason.
mkdir -p /tmp/lockstep-ci
cat > /tmp/lockstep-ci/ci.yml <<'YAML'
name: ci

on:
  push:
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "24"
      - run: npm install --no-audit --no-fund
      - run: node --test
YAML

for dir in "$FIXTURES"/*/; do
  id="$(basename "$dir")"
  [ -d "$dir/repo" ] || continue

  # Read through stdin rather than by path: this script runs under git-bash on Windows, where a
  # /c/... path is not resolvable by the Windows node binary that receives it.
  read -r pkg from to <<<"$(python -c "import json,sys; f=json.load(sys.stdin); print(f['package'], f['from'], f['to'])" < "$dir/fixture.json")"

  git checkout -q --orphan "base/$id"
  git rm -rqf . >/dev/null 2>&1 || true
  find . -mindepth 1 -maxdepth 1 -not -name .git -exec rm -rf {} +

  cp -r "$dir/repo/." .
  mkdir -p .github/workflows
  cp /tmp/lockstep-ci/ci.yml .github/workflows/ci.yml

  git add -A
  git commit -qm "chore: seed $id at $pkg@$from"
  git push -q -f origin "base/$id"

  git checkout -qb "renovate/$id"
  node -e "
    const fs = require('node:fs');
    const m = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    for (const field of ['dependencies', 'devDependencies']) {
      if (m[field]?.['$pkg']) m[field]['$pkg'] = '$to';
    }
    fs.writeFileSync('package.json', JSON.stringify(m, null, 2) + '\n');
  "
  git commit -qam "chore(deps): update $pkg to $to"
  git push -q -f origin "renovate/$id"

  echo "pushed $id  ($pkg $from -> $to)"
done

echo
echo "Branches pushed. Open the pull requests with scripts/open-corpus-prs.sh"
