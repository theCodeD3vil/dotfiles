# dotfiles

Your starting point for a clean development machine: a configured terminal,
editor, Git setup, command-line tools, and optional AI coding tools. Clone this
repository, run one installer, then make it your own.

It supports macOS and Ubuntu. The installer is designed for a new machine, but
it is safe to run again later: it installs missing pieces without upgrading or
deleting existing packages.

## Start here

You need a normal user account with `sudo` access, a working internet
connection, and time for downloads. The first run installs Homebrew, command
line tools, and applications, so expect it to take a while.

### macOS

Open Terminal and run this first:

```sh
git --version
```

If macOS offers to install the Xcode Command Line Tools, choose **Install**.
Wait for it to finish, then run the command again. Once Git responds with a
version number, continue below.

### Ubuntu

Open a terminal and install Git first:

```sh
sudo apt-get update
sudo apt-get install -y git
```

### Install the setup

Run these commands on either operating system:

```sh
git clone https://github.com/theCodeD3vil/dotfiles ~/dotfiles
~/dotfiles/bootstrap/install.sh --dry-run
~/dotfiles/bootstrap/install.sh
```

The dry run is a preview. It changes nothing and is the right place to stop if
the plan is not what you expected. The real run asks for your `sudo` password
when it needs to install system software.

When the installer finishes, open a fresh terminal or run:

```sh
exec zsh
```

## What the installer does

The installer sets up the machine in this order:

1. Installs the basics needed to continue: Xcode Command Line Tools on macOS,
   or Ubuntu build tools and dependencies on Linux.
2. Installs Homebrew and the command-line tools listed in the Brewfiles.
3. Installs Bun, pnpm, nvm, Node LTS, and the configured global packages.
4. Installs the Claude Code and OpenCode command-line clients.
5. Installs oh-my-zsh and the shell plugins used by this setup.
6. Fetches the plugin checkouts this repository tracks as Git submodules
   (fzf-git and the Catppuccin tmux palette) when they are empty.
7. Links the configuration files in this repository into your home directory.
8. Applies the small Ubuntu-only shell fixes when needed.
9. Sets up rtk, icm, the bat theme cache, yazi packages, worktrunk, and the
   pass-cli shell completions when those commands are available.

On macOS, it also installs the Mac-only applications and App Store items listed
in `bootstrap/Brewfile.mac`. On Ubuntu, Homebrew provides the developer tools
after the initial `apt` setup.

## What changes on your machine

- Configuration files such as `~/.zshrc`, `~/.gitconfig`, and `~/.config/nvim`
  become symbolic links to this repository. Editing the file here changes the
  live configuration immediately.
- If an existing file would be replaced, it is moved to
  `~/.dotfiles-backup/<timestamp>/`. Nothing is silently overwritten.
- Installed packages are added only when missing. The normal run does not
  upgrade or remove packages.
- A log for every real run is saved in `~/.cache/dotfiles-install/`.

## After installation

Some accounts and credentials are intentionally left to you:

```sh
gh auth login
```

- Run `claude` and `opencode` to sign in to those tools.
- Add or restore your SSH keys and SSH agent.
- On macOS, sign in to the App Store, then run the installer again if any App
  Store application was skipped.

## If something goes wrong

Read the error and run the installer again:

```sh
~/dotfiles/bootstrap/install.sh
```

It is meant to be re-runnable. Finished work is detected and skipped.

Useful options:

| Command | Use it when you want to... |
|---|---|
| `--dry-run` | preview a run without changing anything |
| `--skip NAME` | skip a step, for example `--skip brew` |

Run `~/dotfiles/bootstrap/install.sh --help` for the full list of step names
and options.

## What you get

| Area | Included |
|---|---|
| Shell | Homebrew's zsh, oh-my-zsh, awesome-lazy-zsh, syntax highlighting, zoxide, fzf, and Starship |
| Terminal workflow | tmux, sesh, atuin, eza, bat, ripgrep, fd, yazi, and television |
| Editing | Neovim with NvChad |
| Git and project work | Git, delta, lazygit, gh, worktrunk, and gitmux |
| Development | Node LTS through nvm, Bun, pnpm, Python, Rust tooling, Go tools, and common CLI utilities |
| AI tools | Claude Code, OpenCode, rtk, icm, and agent-browser |
| macOS extras | Ghostty, Kaku, Warp, iTerm2, Sketchybar, App Store applications, VS Code extensions, and other casks |

The exact package list lives in `bootstrap/Brewfile`, with macOS-only additions
in `bootstrap/Brewfile.mac`. Ubuntu prerequisites are in `bootstrap/apt.txt`.

## Make it yours

This is a working setup, not a requirement to keep every choice.

- Change shell settings in `.zshrc`.
- Change Git defaults in `.gitconfig`.
- Change terminal, editor, tmux, and prompt settings under `.config/`.
- Add or remove packages from the files in `bootstrap/`, then rerun the
  installer.
- Check your edits with `git -C ~/dotfiles status` before committing them.

`bootstrap/` contains setup instructions and package lists; it is not linked
into your home directory. `AI/` is a separate Stow package for the tracked
OpenCode configuration. `notes.txt` records implementation decisions for the
installer.

## Palette

Everything uses [Catppuccin Mocha](https://catppuccin.com/palette), through each
tool's official port where one exists. Ports that need an accent use mauve. The
Vira theme files (`vira-theme-for-terminals/` and the `vira-*` files next to each
config) are kept but no longer selected.

| Tool | Where the theme comes from |
|---|---|
| Ghostty, WezTerm, Kaku | the built-in `Catppuccin Mocha` scheme |
| tmux | `catppuccin_mocha_tmux.conf` from the catppuccin/tmux submodule, sourced by `.config/tmux/conf/theme.conf`; everything reads `#{@thm_*}` |
| Starship | `[palettes.catppuccin_mocha]` in `.config/starship.toml` |
| bat, delta | `.config/bat/themes/Catppuccin Mocha.tmTheme` (catppuccin/bat); `.config/delta/catppuccin.gitconfig` (catppuccin/delta), included from `.gitconfig`. Run `bat cache --build` after changing the bat theme |
| eza | `.config/eza/theme.yml` (catppuccin/eza) |
| Atuin | `.config/atuin/themes/catppuccin-mocha-mauve.toml` (catppuccin/atuin) |
| yazi | `catppuccin-mocha` from yazi-rs/flavors, listed in `.config/yazi/package.toml` and installed by `ya pkg install` |
| television | the built-in `catppuccin` theme |
| Neovim | NvChad's built-in `catppuccin` theme, set in `chadrc.lua` |
| OpenCode | the built-in `catppuccin` theme, in `tui.json` and `cli.json` |
| zsh | fzf colors from catppuccin/fzf in `.zshrc`; zsh-patina's built-in `catppuccin-mocha` theme, set in `.config/zsh-patina/config.toml` |
| gitmux | hex copied by hand into `.gitmux.conf` (gitmux output can't read tmux options) |
| Claude Code | `AI/.claude/themes/catppuccin-mocha.json`, linked into `~/.claude/themes`; selected with `/theme` (`custom:catppuccin-mocha`) |
| Claude Code mods, OpenCode statusline | hex in `ember-ribbon/hooks/colors.ts`, `desk-pet/hooks/wick.ts` (flame and props; Wick's body keeps its own orange), `session-panes/hooks/register.tsx` and the statusline's `src/footer.ts`. Ember Ribbon's palette must match the statusline's; run `bash build.sh` in the statusline after a change |
| Warp | not managed here (still Vira) |

`prefix + s` opens `tv sesh` in a translucent tmux popup. It deliberately uses
the terminal's default background so Ghostty and WezTerm transparency can show
through.
