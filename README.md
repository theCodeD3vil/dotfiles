# dotfiles

macOS dotfiles, symlinked into `$HOME` with [GNU Stow](https://www.gnu.org/software/stow/).
The repo lives at `~/dotfiles`, so running `stow .` from here links everything
into `~`. `.stow-local-ignore` keeps this README, `notes.txt`, `AI/` and
`.DS_Store` out of `$HOME`.

## What's here

| Path | What it configures |
|---|---|
| `.zshrc`, `.gitconfig` | shell and git |
| `.gitmux.conf` | the git pill in the tmux status bar |
| `.wezterm.lua`, `.config/ghostty/` | terminals |
| `.config/tmux/` | tmux (`tmux.conf` is only an entry point; settings are in `conf/*.conf`) |
| `.config/nvim/` | Neovim (NvChad, with the `vira_*` themes in `lua/themes/`) |
| `.config/starship.toml` | prompt |
| `.config/{atuin,bat,television,topgrade.toml,worktrunk,sketchybar}` | the matching tools |
| `Library/` | iTerm2 and Terminal preferences, the Caddy launch agent |
| `vira-theme-for-terminals/` | vendored upstream pack of terminal colour schemes (see [Palette](#palette)) |
| `bootstrap/` | package lists and `install.sh` for setting up a new machine (see [New machine](#new-machine)) |
| `AI/` | opencode config (`opencode.json`, `tui.json`), stowed separately (has its own `.stow-local-ignore`) |

`notes.txt` holds the design notes for `bootstrap/install.sh`.

## New machine

The repo is public, so a fresh Mac or Ubuntu box needs no credentials to start:

```sh
git clone https://github.com/theCodeD3vil/dotfiles ~/dotfiles
~/dotfiles/bootstrap/install.sh --dry-run    # preview, changes nothing
~/dotfiles/bootstrap/install.sh
```

A minimal Ubuntu install needs `git` first: `sudo apt-get install -y git`.

`install.sh` is re-runnable and install-only: it adds what is missing and never
upgrades or deletes anything. See `--help` for `--upgrade`, `--check-cleanup` and
`--skip STEP`. In order it:

1. installs the prerequisites and Homebrew (Xcode tools on a Mac, `apt.txt` on Ubuntu)
2. runs `brew bundle` on `bootstrap/Brewfile`, plus `Brewfile.mac` on a Mac
3. installs bun, pnpm and nvm (Node LTS plus the packages in `npm.txt`)
4. installs the Claude Code and opencode CLIs
5. installs the packages in `bun.txt` and `pnpm.txt`
6. clones oh-my-zsh and the plugins in `omz-plugins.txt`
7. stows the dotfiles, moving any file that is in the way to `~/.dotfiles-backup/<timestamp>/`
8. runs the `rtk` and `icm` inits

While it runs you get a spinner and elapsed time for every long task, a progress
bar for `brew bundle`, and a summary at the end (colours are your Catppuccin
palette). Piped or CI runs, `NO_COLOR` and `--plain` get plain lines instead, and
`--demo` previews the display with fake tasks. Every real run is logged to
`~/.cache/dotfiles-install/`.

Still manual: logging in to `claude` and `opencode`, `gh auth login`, SSH keys,
and on a Mac signing in to the App Store for the `mas` apps.

The Mac path is tested. The Ubuntu path (apt, Linuxbrew) has not been run on a
real machine yet, so run it with `--dry-run` first.

## tmux busy spinner

Inactive tmux windows swap their index for a teal braille spinner while they are
printing output (a download, a build, an agent working), and go back to the number
when the output stops. The active window never shows it: your own typing counts
as output, and you are looking at it anyway.

- `.config/tmux/scripts/spinner.sh`: a small background loop, started once per
  tmux server (a reload starts a second copy that exits at once; it also exits
  when the server does). "Busy" means the window printed something in the last
  `BUSY_SECS` seconds; `FAST`, `SLOW` and `FRAMES` are at the top of the script.
  It sets the window option `@busy` and the global `@spin` (the current frame).
  It steps every ~80 ms (12 fps, even to within a few ms). Cost: about 2% of a
  core while animating, 0.2% idle.
- `.config/tmux/conf/windows.conf`: the `run-shell -b` line that starts the loop,
  and `#{?@busy,#{@spin},#I}` in `window-status-format` (inactive windows only).
- To turn it off, delete the `run-shell -b` line and that conditional.

It measures output, not "a task is running". A silent long task looks idle, and
something that redraws constantly (`htop`, `tail -f`) looks busy. A window that was
just created also shows the spinner for `BUSY_SECS` seconds, from its shell startup
output. tmux's own `monitor-activity` and `monitor-silence` flags can't do this:
they stay set until you visit the window.

## Palette

There is no single palette file. Colours are spelled out once **per tool**,
because most of these formats can't import from each other (see
[Why not one file](#why-not-one-file)). This section says where each one lives.

### Which palettes are in use

- **Catppuccin Mocha**: tmux, gitmux, starship, television, zsh syntax
  highlighting, and the "decoration" colours (red, green, blue, ...) in the nvim
  themes.
  Reference: <https://catppuccin.com/palette>.
- **Vira Theme - Carbon**: terminal background, foreground, cursor, selection
  and ANSI colours in Ghostty and WezTerm. The Ghostty values are copied from
  `vira-theme-for-terminals/ghostty/Vira-Theme-Carbon.conf`. WezTerm has no
  variant in that pack, so `.wezterm.lua` is a hand translation of the Ghostty
  one. Change a terminal colour in **both** files.
- Everything else has its own colours and isn't Catppuccin: the `vira_*` nvim
  surface ramps, `bat/themes/` (a Tokyo Night `.tmTheme`), and the Sketchybar bar
  (`sketchybarrc`).

### Where each tool's Mocha colours live

| Tool | File | How the colours are used |
|---|---|---|
| tmux | `.config/tmux/conf/theme.conf` | Defines `set -g @thm_<name> "#hex"` for the names in use. Every other tmux file reads `#{@thm_<name>}` (`status.conf`, `windows.conf`, `panes.conf`), so this is the only tmux file with hex. |
| nvim | `.config/nvim/lua/palette.lua` | Returns a name-to-hex table. `themes/vira_*.lua` (the `base_30` and `base_16` tables) and `highlights.lua` do `local p = require("palette")` and use `p.red`, `p.green`, ... |
| starship | `.config/starship.toml` | `[palettes.catppuccin_mocha]` maps roles (`color_red`, `color_fg0`, ...) to hex. Modules use the role names. |
| zsh | `.zshrc` | `ctp_pink` and `ctp_teal`, used by `ZSH_HIGHLIGHT_STYLES`. |
| television | `.config/television/themes/catppuccin-mocha.toml` | One hex per tv role (`border_fg`, `selection_bg`, ...), selected by `theme = "catppuccin-mocha"` in `config.toml`. `background` is left out on purpose, see [Transparent sesh popup](#transparent-sesh-popup). |
| gitmux | `.gitmux.conf` | Hex in the `styles:` block, copied by hand. gitmux output is inserted into tmux after formats are expanded, so `#{@thm_*}` doesn't work there. |

### Transparent sesh popup

`prefix + s` opens `tv sesh` in a tmux popup that is translucent and blurred like
the rest of the terminal. Ghostty (`background-opacity`, `background-blur-radius`)
and WezTerm (`window_background_opacity`, `macos_window_background_blur`) only
apply that to cells drawn with the **default** background. So nothing in the
popup may set an explicit one:

- tmux: `popup-style` in `.config/tmux/conf/theme.conf` uses `bg=default`.
- television: the theme has no `background` line. The built-in `catppuccin`
  theme sets one, which is why it isn't used.

The popup border and title colour is `popup-border-style` in
`.config/tmux/conf/panes.conf` (mauve). The panel borders inside tv come from
the television theme.

### Common edits

- **Change which colour something uses** (for example the active window pill):
  edit the `#{@thm_<name>}` reference where it's used. The active window is in
  `.config/tmux/conf/windows.conf`, the side pills are in `status.conf`.
- **Use a Mocha colour tmux doesn't define yet**: add a `set -g @thm_<name>` line
  to `theme.conf`, then reference it as `#{@thm_<name>}`.
- **Use a Mocha colour nvim doesn't define yet**: add it to `lua/palette.lua`,
  then use `p.<name>` in the theme or highlight file.
- **Change what a colour looks like everywhere** (say, a different green): the
  hex has to be edited in `theme.conf`, `palette.lua`, `starship.toml`,
  `.gitmux.conf`, `.zshrc` and the television theme. Each file only contains the
  names it uses, so search for the old hex.
- **Change the nvim theme or its surfaces**: the default theme is set in
  `.config/nvim/lua/chadrc.lua` (`vira_ocean`). Each `themes/vira_*.lua` mixes
  its own background/foreground ramp (hardcoded, from the Vira pack) with
  Mocha decoration colours (from `palette.lua`).

### Why not one file

tmux, nvim and zsh can each read a shared value (`@thm_*` options, `require`,
`source`), but not from the same file. starship (TOML) and gitmux (YAML) can't
import anything at all, so keeping them in sync would mean generating their
files from a template. That was judged more machinery than 6 small palette
blocks are worth. If it ever is: one palette file plus a small script that
writes the per-tool files, with a drift check.

### Finding stray hex

This lists every Mocha hex left in the repo (vendored plugins and the Vira pack
excluded). Expect only the six files in the table above, plus an example hex in
a `television/config.toml` comment:

```sh
grep -rIiE '#(f5e0dc|f2cdcd|f5c2e7|cba6f7|f38ba8|eba0ac|fab387|f9e2af|a6e3a1|94e2d5|89dceb|74c7ec|89b4fa|b4befe|cdd6f4|bac2de|a6adc8|9399b2|7f849c|6c7086|585b70|45475a|313244|1e1e2e|181825|11111b)\b' \
  ~/dotfiles --exclude-dir=.git --exclude-dir=plugins --exclude-dir=Library \
  --exclude-dir=vira-theme-for-terminals --exclude='*.json'
```

A hit in any other file means a colour was pasted in where it should reference
one of the sources above.
