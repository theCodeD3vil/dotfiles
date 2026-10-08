#!/usr/bin/env bash
# Build the Ember Ribbon footer and (re)install it into OpenCode V2.
# Compile Solid JSX before installing the server and TUI entrypoints as the
# existing local Git package. Requires Bun.
set -euo pipefail

sourceDirectory="$(cd "$(dirname "$0")" && pwd)"
pluginInstallDirectory="${XDG_DATA_HOME:-$HOME/.local/share}/opencode-statusline"
pluginSpec="git+file://$pluginInstallDirectory"

cd "$sourceDirectory"
bun install --silent
bun run build

mkdir -p "$pluginInstallDirectory/dist"
cp dist/*.js "$pluginInstallDirectory/dist/"
bun -e '
const pluginPackage = await Bun.file("./package.json").json()
delete pluginPackage.devDependencies
delete pluginPackage.scripts
await Bun.write(process.argv[1], `${JSON.stringify(pluginPackage, null, 2)}\n`)
' "$pluginInstallDirectory/package.json"

git -C "$pluginInstallDirectory" init -q
git -C "$pluginInstallDirectory" add -- dist package.json
if ! git -C "$pluginInstallDirectory" diff --cached --quiet; then
  git -C "$pluginInstallDirectory" -c user.name=statusline -c user.email=statusline@localhost commit -qm "build(statusline): install Ember Ribbon footer"
fi

# Run from HOME: the dotfiles opencode.json beside this package is a bootstrap
# template and would shadow the live global configuration in this directory.
(
  cd "$HOME"
  if grep -q "opencode-statusline" "$HOME/.config/opencode/opencode.json"; then
    opencode plugin update "$pluginSpec"
  else
    opencode plugin add "$pluginSpec"
  fi
)
