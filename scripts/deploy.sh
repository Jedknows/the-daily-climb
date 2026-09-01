#!/usr/bin/env bash
# Publish dist/ to the gh-pages branch.
#
# This exists because the local gh token has `repo` but not `workflow` scope,
# so the Actions workflow in docs/pages-workflow.yml can't be pushed. Grant it
# once with `gh auth refresh -s workflow`, move that file to
# .github/workflows/, and deploys become automatic on push instead.
set -euo pipefail
cd "$(dirname "$0")/.."

npm run check
npm run build

# .nojekyll stops Pages from hiding files that start with an underscore.
touch dist/.nojekyll

tmp=$(mktemp -d)
cp -R dist/. "$tmp/"
git --work-tree="$tmp" checkout --orphan gh-pages-tmp 2>/dev/null || git --work-tree="$tmp" checkout --orphan gh-pages-tmp
git --work-tree="$tmp" add -A
git --work-tree="$tmp" -c user.name="Jed Siegel" -c user.email="jedsiegel5@gmail.com" \
  commit -q -m "Deploy $(git rev-parse --short HEAD)"
git branch -M gh-pages-tmp gh-pages
git push -f origin gh-pages
git checkout -f main
rm -rf "$tmp"
echo "deployed → https://jedknows.github.io/the-daily-climb/"
