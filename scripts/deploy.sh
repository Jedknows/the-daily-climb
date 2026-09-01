#!/usr/bin/env bash
# Publish dist/ to the gh-pages branch.
#
# This exists because the local gh token has `repo` but not `workflow` scope,
# so the Actions workflow in docs/pages-workflow.yml can't be pushed. Grant it
# once with `gh auth refresh -s workflow`, move that file to
# .github/workflows/, and deploys become automatic on push instead.
#
# The publish happens inside a throwaway repo in /tmp rather than by juggling
# branches here: nothing this script does can leave the working tree on the
# wrong branch or half-checked-out if it fails partway.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

npm run check
npm run build
touch dist/.nojekyll   # stop Pages hiding _-prefixed files

remote="$(git remote get-url origin)"
sha="$(git rev-parse --short HEAD)"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
cp -R dist/. "$tmp/"
cd "$tmp"
git init -q
git checkout -q -b gh-pages
git add -A
git -c user.name="Jed Siegel" -c user.email="jedsiegel5@gmail.com" \
    commit -q -m "Deploy $sha"
git push -q -f "$remote" gh-pages

echo "deployed $sha → https://jedknows.github.io/the-daily-climb/"
