#!/usr/bin/env bash
# Build the statusline TUI plugin and (re)install it into OpenCode V2.
# V2 only loads TUI plugins from npm/Git specifiers, and the Solid JSX transform
# only runs outside node_modules, so we compile here and install the result from
# a local git repo in the data dir. Requires bun, npm and node.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
out="${XDG_DATA_HOME:-$HOME/.local/share}/opencode-statusline"
spec="git+file://$out"

cd "$here"
npm install --silent
bun run build

rm -rf "$out"
mkdir -p "$out/dist"
cp dist/*.js "$out/dist/"
node -e '
const p = require("./package.json")
delete p.devDependencies
delete p.scripts
require("fs").writeFileSync(process.argv[1], JSON.stringify(p, null, 2))
' "$out/package.json"

git -C "$out" init -q
git -C "$out" add -A
git -C "$out" -c user.name=statusline -c user.email=statusline@localhost commit -qm "build $(date -u +%FT%TZ)"

if grep -q "opencode-statusline" "$HOME/.config/opencode/opencode.json"; then
  opencode plugin update
else
  opencode plugin add "$spec"
fi
