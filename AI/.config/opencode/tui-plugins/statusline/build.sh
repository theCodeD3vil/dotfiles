#!/usr/bin/env bash
# Build the Ember Ribbon footer and (re)install it into OpenCode V2.
# Compile Solid JSX before installing the server and TUI entrypoints as the
# existing local Git package. Requires bun, npm and node.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
out="${XDG_DATA_HOME:-$HOME/.local/share}/opencode-statusline"
spec="git+file://$out"

cd "$here"
npm install --silent
bun run build

mkdir -p "$out/dist"
cp dist/*.js "$out/dist/"
node -e '
const p = require("./package.json")
delete p.devDependencies
delete p.scripts
require("fs").writeFileSync(process.argv[1], JSON.stringify(p, null, 2))
' "$out/package.json"

git -C "$out" init -q
git -C "$out" add -- dist package.json
if ! git -C "$out" diff --cached --quiet; then
  git -C "$out" -c user.name=statusline -c user.email=statusline@localhost commit -qm "build(statusline): install Ember Ribbon footer"
fi

# Run from HOME: the dotfiles opencode.json beside this package is a bootstrap
# template and would shadow the live global configuration in this directory.
(
  cd "$HOME"
  if grep -q "opencode-statusline" "$HOME/.config/opencode/opencode.json"; then
    opencode plugin update "$spec"
  else
    opencode plugin add "$spec"
  fi
)
