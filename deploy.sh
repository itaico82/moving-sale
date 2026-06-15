#!/usr/bin/env bash
# Create the GitHub repo (if needed), push, and enable GitHub Pages.
# Requires: gh authenticated as itaico82, and api.github.com reachable.
set -euo pipefail

REPO="itaico82/moving-sale"
cd "$(dirname "$0")"

echo "→ Checking GitHub API connectivity…"
if ! curl -s -m 8 -o /dev/null https://api.github.com; then
  echo "✗ api.github.com is unreachable. Check VPN/DNS and retry." >&2
  exit 1
fi

git branch -M main

if gh repo view "$REPO" >/dev/null 2>&1; then
  echo "→ Repo exists; pushing…"
  git remote get-url origin >/dev/null 2>&1 || git remote add origin "git@github.com:$REPO.git"
  git push -u origin main
else
  echo "→ Creating public repo and pushing…"
  gh repo create "$REPO" --public --source=. --remote=origin \
    --description "Moving sale catalog — bilingual HE/EN, hosted on GitHub Pages" --push
fi

echo "→ Enabling GitHub Pages (main branch, root)…"
gh api -X POST "repos/$REPO/pages" \
  -f 'source[branch]=main' -f 'source[path]=/' 2>/dev/null \
  || gh api -X PUT "repos/$REPO/pages" -f 'source[branch]=main' -f 'source[path]=/' 2>/dev/null \
  || echo "  (Pages may already be enabled, or enable it in Settings → Pages.)"

echo "✓ Done. Site will be live shortly at: https://itaico82.github.io/moving-sale/"
