# *****************************************************************************
# .ZSHRC
# *****************************************************************************

# *****************************************************************************
# PACKAGE MANAGERS
# *****************************************************************************

# Homebrew on Linux. On macOS the awesome-lazy-zsh managed block below runs
# `brew shellenv` itself.
[ -x /home/linuxbrew/.linuxbrew/bin/brew ] && eval "$(/home/linuxbrew/.linuxbrew/bin/brew shellenv)"

# pnpm
case "$(uname -s)" in
  Darwin) export PNPM_HOME="$HOME/Library/pnpm" ;;
  *)      export PNPM_HOME="${XDG_DATA_HOME:-$HOME/.local/share}/pnpm" ;;
esac
# pnpm 11 and older keep the binary in $PNPM_HOME, pnpm 12 and newer in $PNPM_HOME/bin.
for _pnpm_dir in "$PNPM_HOME/bin" "$PNPM_HOME"; do
  case ":$PATH:" in
    *":$_pnpm_dir:"*) ;;
    *) export PATH="$_pnpm_dir:$PATH" ;;
  esac
done
unset _pnpm_dir
# pnpm end

# bun
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"

# *****************************************************************************
# TOOLCHAIN PATH ADDITIONS
# *****************************************************************************

# Assorted `export PATH=...` lines dropped in by various CLI/IDE
# installers. Some duplicate each other (kept as installed - see
# notes below - harmless, just redundant).

ZSH_COLORIZE_STYLE="github-dark"

# Added by Antigravity
export PATH="$HOME/.antigravity/antigravity/bin:$PATH"

# opencode
export PATH=$HOME/.opencode/bin:$PATH

[[ "$TERM_PROGRAM" == "kiro" ]] && . "$(kiro --locate-shell-integration-path zsh)"
export PATH="$PATH:$HOME/go/bin"
export PATH="$HOME/.local/bin:$PATH"

# Added by LM Studio CLI (lms)
export PATH="$PATH:$HOME/.lmstudio/bin"
# End of LM Studio CLI section

# duplicates the $HOME/.local/bin export above
# Added by Antigravity CLI installer
export PATH="$HOME/.local/bin:$PATH"

# Vite+ bin (https://viteplus.dev)
[ -f "$HOME/.vite-plus/env" ] && . "$HOME/.vite-plus/env"

# Added by Antigravity IDE
export PATH="$HOME/.antigravity-ide/antigravity-ide/bin:$PATH"

# Pi
export PATH="$HOME/.vite-plus/js_runtime/node/24.19.0/bin:$PATH"

# duplicates the Antigravity IDE export above
# Added by Antigravity IDE
export PATH="$HOME/.antigravity-ide/antigravity-ide/bin:$PATH"

# *****************************************************************************
# ALIASES
# *****************************************************************************

alias uncommit="git reset --soft HEAD~1"
alias claude2='CLAUDE_CONFIG_DIR=~/.config/claude-code-sub2 claude'
alias headroom-reapply='python3 -B "$HOME/dotfiles/bootstrap/headroom-usage-headers/apply.py"'

# *****************************************************************************
# GUM PICKERS — pick instead of type, guard instead of just run
# *****************************************************************************

# Re-sourcing this file inside a shell that already has gco/gbclean aliased
# (from a previous load, before the managed block's unalias runs again below)
# would otherwise make zsh choke defining a function under an aliased name.
unalias gco gbclean 2>/dev/null

# git: fuzzy-checkout a local branch
git-checkout() { git checkout "$(git branch --sort=-committerdate | sed 's/^[* ] //' | gum filter --placeholder 'branch')" }

# git: multi-select merged local branches to delete
git-branch-clean() {
  local merged br
  merged=$(git branch --merged | grep -vE '^\*|main|master')
  [ -n "$merged" ] || { echo "nothing to clean"; return 0; }
  br=$(echo "$merged" | gum choose --no-limit)
  [ -n "$br" ] || return 0
  gum confirm "delete: $(echo "$br" | tr '\n' ' ')?" && echo "$br" | xargs git branch -d
}

# gh: pick an open PR, open it in the browser
gh-prs() {
  local prs; prs=$(gh pr list --json number,title -q '.[]|"\(.number)\t\(.title)"')
  [ -n "$prs" ] || { echo "no open PRs"; return 0; }
  echo "$prs" | gum filter | cut -f1 | xargs -r gh pr view --web
}

# docker: pick a running container to tail or shell into
dlogs() {
  local c; c=$(docker ps --format '{{.Names}}' 2>/dev/null)
  [ -n "$c" ] || { echo "no running containers"; return 0; }
  echo "$c" | gum filter | xargs -r docker logs -f
}
dsh() {
  local c; c=$(docker ps --format '{{.Names}}' 2>/dev/null)
  [ -n "$c" ] || { echo "no running containers"; return 0; }
  echo "$c" | gum filter | xargs -r -I{} docker exec -it {} sh
}

# worktrunk: pick a worktree branch to switch to
wt-switch() {
  local b; b=$(wt list --format json 2>/dev/null | jq -r '.items[] | select(.branch != null) | .branch')
  [ -n "$b" ] || { echo "no worktree branches"; return 0; }
  # no xargs: it would bypass the wt shell function, which does the cd
  local sel; sel=$(echo "$b" | gum filter)
  [ -n "$sel" ] && wt switch "$sel"
}

# tmux: pick a running session, attach to it (from outside tmux)
tmux-attach() {
  [ -z "$TMUX" ] || { echo "already inside tmux"; return 1; }
  local s; s=$(tmux list-sessions -F '#{session_name}' 2>/dev/null)
  [ -n "$s" ] || { echo "no tmux sessions"; return 0; }
  local sel; sel=$(echo "$s" | gum filter --placeholder 'session')
  [ -n "$sel" ] || return 0
  tmux attach-session -t "=$sel"
}

# pass-cli: pick a secret, copy its password to the clipboard (macOS only; field
# names below are best-effort from `pass-cli item list --help` since listing real
# vault contents to verify the JSON shape needs a live vault, not tested end-to-end)
passc() {
  local sel id
  sel=$(pass-cli item list --output json | jq -r '.[] | "\(.id)\t\(.title // .name)"' | gum filter --placeholder 'secret')
  [ -n "$sel" ] || return 0
  id=${sel%%$'\t'*}
  if [[ "$OSTYPE" == darwin* ]]; then
    pass-cli item view --item-id "$id" --field password --output human | pbcopy && echo "copied to clipboard"
  else
    pass-cli item view --item-id "$id" --field password --output human
  fi
}

# homebrew: pick a leaf package (nothing else depends on it) to uninstall
brew-remove() { brew leaves | gum filter --placeholder 'uninstall which?' | xargs -r brew uninstall }

# guarded rm -rf
rmi() { gum confirm "rm -rf $*?" && rm -rf "$@" }

# nuxt-workspace plugin, per project only (--scope project writes to ./.claude/settings.json,
# never user-wide). Run from a project root; re-run to update the rules.
nuxt-setup() {
  [ -f package.json ] || { echo "run from a project root (no package.json here)"; return 1; }
  claude plugin marketplace add theCodeD3vil/nuxt-workspace --scope project || return 1
  claude plugin install nuxt-workspace@nuxt-workspace --scope project || return 1
  npx degit theCodeD3vil/nuxt-workspace/rules .claude/rules --force
}

# *****************************************************************************
# RUNTIME VERSION MANAGER (MISE)
# *****************************************************************************

if command -v mise >/dev/null 2>&1; then
  eval "$(mise activate zsh)"
elif [ -x "$HOME/.local/bin/mise" ]; then
  eval "$($HOME/.local/bin/mise activate zsh)"
fi

# *****************************************************************************
# OH-MY-ZSH / AWESOME-LAZY-ZSH
# *****************************************************************************

# Managed by the awesome-lazy-zsh CLI - contents between the
# >>>/<<< markers are regenerated by that tool. Do not hand-edit
# or reorder anything inside; customizations go above it.

# Completion dirs must be on fpath before the block below: oh-my-zsh runs the
# shell's compinit inside it, and a later compinit that sees a different fpath
# rewrites the shared dump on every start. ~/.zfunc holds completions that
# bootstrap/install.sh generates (pass-cli ships a generator, not a file).
fpath=(~/.docker/completions ~/.zfunc $fpath)

export DING_SUCCESS_SOUND=Funk
# Claude Code drops to 256 colours under tmux unless told tmux passes RGB through (it does).
export CLAUDE_CODE_TMUX_TRUECOLOR=1

# Ghost text from deja, in Catppuccin Mocha overlay2. Its default (fg=8) is the
# terminal's palette entry 8, which Kaku draws nearly white. deja reads this when it
# loads, so it has to be set before the block below.
export DEJA_HIGHLIGHT_STYLE='fg=#9399b2'

# deja cycles history alternatives on Tab by default, which swallows Tab whenever ghost
# text is showing and hides zsh/cod completions. Move the cycle to Ctrl+N.
export DEJA_CYCLE_KEY='^N'

# >>> awesome-lazy-zsh managed block >>>
#      _                                               _                         _____    _
#     / \__      _____  ___  ___  _ __ ___   ___      | |    __ _ _____   _     |__  /___| |__
#    / _ \ \ /\ / / _ \/ __|/ _ \| '_ ` _ \ / _ \_____| |   / _` |_  / | | |_____ / // __| '_ \
#   / ___ \ V  V /  __/\__ \ (_) | | | | | |  __/_____| |__| (_| |/ /| |_| |_____/ /_\__ \ | | |
#  /_/   \_\_/\_/ \___||___/\___/|_| |_| |_|\___|     |_____\__,_/___|\__, |    /____|___/_| |_|
#                                                                      |___/
#
#  https://github.com/AmJaradat01/awesome-lazy-zsh
#  DO NOT EDIT THIS BLOCK - Your customizations should go ABOVE this block
#  Last updated: 2026-08-30T11:32:00.885Z

# Path to your Oh My Zsh installation
export ZSH="$HOME/.oh-my-zsh"

# Theme
# ZSH_THEME="starship"

# Plugins
plugins=(git git-flow npm nvm docker docker-compose vscode extract dotenv ssh-agent node gitfast thefuck ding deja zsh-patina zsh-paste-guard)
# Complete selection for profiles (includes aliases/custom plugins)
# awesome-lazy-zsh-plugins=["git","git-flow","npm","nvm","docker","docker-compose","vscode","extract","dotenv","ssh-agent","node","gitfast","thefuck","deja","zsh-patina","zsh-paste-guard","python","golang","rust","java","git-extras","ssh","directories","history-search","flutter"]

# Load Oh My Zsh
source $ZSH/oh-my-zsh.sh

# oh-my-zsh exports a default LS_COLORS (red executables). eza reads it ahead of
# ~/.config/eza/theme.yml, and ls here is eza, so drop it and let the theme apply.
unset LS_COLORS

# Homebrew PATH for Apple Silicon
export PATH="/opt/homebrew/bin:$PATH"
export HOMEBREW_NO_AUTO_UPDATE=1

# Visual Studio Code Path
export PATH="$PATH:/Applications/Visual Studio Code.app/Contents/Resources/app/bin"

# Docker Path
export PATH="$PATH:/Applications/Docker.app/Contents/Resources/bin/"

# Docker Aliases
# dstop/drm are defined after the managed block below (see the override section
# past it): both the docker plugin and awesome-lazy-zsh's alias-manager.zsh
# redefine them as plain aliases, which breaks a same-named function this early.
alias dps='docker ps'
alias dimages='docker images'
alias dbuild='docker build -t'

# Docker CLI completions
fpath=(~/.docker/completions $fpath)
autoload -Uz compinit
compinit

# NVM Setup
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
[ -s "$NVM_DIR/bash_completion" ] && . "$NVM_DIR/bash_completion"

# Git Branch Function
git_branch() {
    git branch 2>/dev/null | grep '^*' | colrm 1 2
}

# System Optimizations
# macOS specific settings
export BROWSER="open"
eval "$(/opt/homebrew/bin/brew shellenv)"

# Terminal Integration
source $HOME/.iterm2_shell_integration.zsh

# Local secrets (untracked, outside the dotfiles repo — never commit this file's target)
[ -f "$HOME/.secrets.zsh" ] && source "$HOME/.secrets.zsh"

# Awesome-Lazy-Zsh Custom Aliases
[ -f "/opt/homebrew/opt/awesome-lazy-zsh/libexec/src/aliases/extract.zsh" ] && source "/opt/homebrew/opt/awesome-lazy-zsh/libexec/src/aliases/extract.zsh"
[ -f "/opt/homebrew/opt/awesome-lazy-zsh/libexec/src/aliases/dotenv.zsh" ] && source "/opt/homebrew/opt/awesome-lazy-zsh/libexec/src/aliases/dotenv.zsh"
[ -f "/opt/homebrew/opt/awesome-lazy-zsh/libexec/src/aliases/node.zsh" ] && source "/opt/homebrew/opt/awesome-lazy-zsh/libexec/src/aliases/node.zsh"
unalias pi 2>/dev/null  # frees `pi` for pi-coding-agent binary; plugin above aliases it to `pnpm install`
[ -f "/opt/homebrew/opt/awesome-lazy-zsh/libexec/src/aliases/python.zsh" ] && source "/opt/homebrew/opt/awesome-lazy-zsh/libexec/src/aliases/python.zsh"
[ -f "/opt/homebrew/opt/awesome-lazy-zsh/libexec/src/aliases/golang.zsh" ] && source "/opt/homebrew/opt/awesome-lazy-zsh/libexec/src/aliases/golang.zsh"
[ -f "/opt/homebrew/opt/awesome-lazy-zsh/libexec/src/aliases/rust.zsh" ] && source "/opt/homebrew/opt/awesome-lazy-zsh/libexec/src/aliases/rust.zsh"
[ -f "/opt/homebrew/opt/awesome-lazy-zsh/libexec/src/aliases/java.zsh" ] && source "/opt/homebrew/opt/awesome-lazy-zsh/libexec/src/aliases/java.zsh"
[ -f "/opt/homebrew/opt/awesome-lazy-zsh/libexec/src/aliases/git-extras.zsh" ] && source "/opt/homebrew/opt/awesome-lazy-zsh/libexec/src/aliases/git-extras.zsh"
[ -f "/opt/homebrew/opt/awesome-lazy-zsh/libexec/src/aliases/ssh.zsh" ] && source "/opt/homebrew/opt/awesome-lazy-zsh/libexec/src/aliases/ssh.zsh"
[ -f "/opt/homebrew/opt/awesome-lazy-zsh/libexec/src/aliases/directories.zsh" ] && source "/opt/homebrew/opt/awesome-lazy-zsh/libexec/src/aliases/directories.zsh"
[ -f "/opt/homebrew/opt/awesome-lazy-zsh/libexec/src/aliases/history.zsh" ] && source "/opt/homebrew/opt/awesome-lazy-zsh/libexec/src/aliases/history.zsh"

# Awesome-Lazy-Zsh Alias Manager
[ -f "/opt/homebrew/opt/awesome-lazy-zsh/libexec/src/alias-manager.zsh" ] && source "/opt/homebrew/opt/awesome-lazy-zsh/libexec/src/alias-manager.zsh"
# <<< awesome-lazy-zsh managed block <<<

# bun completions (calls compdef, so it has to follow oh-my-zsh's compinit above)
[ -s "$HOME/.bun/_bun" ] && source "$HOME/.bun/_bun"

# cod learns completions from the --help output of commands you run (also needs compdef)
(( $+commands[cod] )) && source <(cod init $$ zsh)

# Overrides for the managed block above. They live outside it so that
# awesome-lazy-zsh regenerating the block can't undo them.
# - nvm's node has to beat the brew node that `brew shellenv` put first on PATH.
[ -n "$NVM_BIN" ] && export PATH="$NVM_BIN:$PATH"
# - the git-extras.zsh alias file and awesome-lazy-zsh's alias-manager.zsh
#   (both sourced inside the block above) redefine gco/gbclean/dstop/drm as
#   plain aliases: gco/gbclean just get shadowed (their functions, defined much
#   earlier, are still intact underneath); dstop/drm are new enough here that
#   the alias makes zsh choke parsing a same-named function ("defining function
#   based on alias"), so they're fully (re)defined below instead of just unaliased.
unalias gco gbclean dstop drm 2>/dev/null
dstop() {
  local ids; ids=$(docker ps -aq)
  [ -n "$ids" ] || return 0
  gum confirm "Stop all containers?" && docker stop $ids
}
drm() {
  local ids; ids=$(docker ps -aq)
  [ -n "$ids" ] || return 0
  gum confirm "Remove all containers?" && docker rm $ids
}
# - the block sets BROWSER=open, which only exists on macOS.
[[ "$OSTYPE" == darwin* ]] || unset BROWSER

# *****************************************************************************
# SHELL INTEGRATION / PROMPT
# *****************************************************************************

eval "$(starship init zsh)"
export EDITOR="nvim"

# *****************************************************************************
# SSH AGENT
# *****************************************************************************

# Two agent sockets set back to back; the second export wins, so
# ProtonPass is what's actually active - Secretive's line is dead
# code as written, left as-is (not my call to drop it), just
# relocated next to its sibling so the override is obvious instead
# of one line sitting 90 lines away from the other.
# macOS only. Elsewhere (a VPS) SSH_AUTH_SOCK is left alone, so a forwarded agent
# (ssh -A) keeps working instead of being pointed at a socket that isn't there.
if [[ "$OSTYPE" == darwin* ]]; then
  export SSH_AUTH_SOCK=$HOME/Library/Containers/com.maxgoedjen.Secretive.SecretAgent/Data/socket.ssh

  #ProtonPass SSH-Agent
  export SSH_AUTH_SOCK=$HOME/.ssh/proton-pass-ssh-agent.sock
fi

# *****************************************************************************
# FZF
# *****************************************************************************

# setup fzf keybindings and completions
eval "$(fzf --zsh)"

# fzf theme — Catppuccin Mocha (catppuccin/fzf)
export FZF_DEFAULT_OPTS=" \
--color=bg+:#313244,bg:#1E1E2E,spinner:#F5E0DC,hl:#F38BA8 \
--color=fg:#CDD6F4,header:#F38BA8,info:#CBA6F7,pointer:#F5E0DC \
--color=marker:#B4BEFE,fg+:#CDD6F4,prompt:#CBA6F7,hl+:#F38BA8 \
--color=selected-bg:#45475A \
--color=border:#6C7086,label:#CDD6F4"


# -- Use fd instead of fzf --

export FZF_DEFAULT_COMMAND="fd --hidden --strip-cwd-prefix --exclude .git"
export FZF_CTRL_T_COMMAND="$FZF_DEFAULT_COMMAND"
export FZF_ALT_C_COMMAND="fd --type=d --hidden --strip-cwd-prefix --exclude .git"

# Use fd (https://github.com/sharkdp/fd) for listing path candidates.
# - The first argument to the function ($1) is the base path to start traversal
# - See the source code (completion.{bash,zsh}) for the details.
_fzf_compgen_path() {
  fd --hidden --exclude .git . "$1"
}

# Use fd to generate the list for directory completion
_fzf_compgen_dir() {
  fd --type=d --hidden --exclude .git . "$1"
}

source ~/fzf-git.sh/fzf-git.sh

export FZF_CTRL_T_OPTS="--preview 'bat -n --color=always --line-range :500 {}'"
export ALT_C_OPTS="--preview 'eza --tree --color=always {} | head -200'"

_fzf_comprun(){
  local command=$1
  shift

  case "$command" in
    cd) fzf --preview 'eza --tree --color=always {} | head -200' "$@" ;;
    ssh) fzf --preview 'dig {}' "$@" ;;
    *) fzf --preview 'bat -n --color=always --line-range :500 {}' "$@" ;;
    esac
}

# *****************************************************************************
# CLI REPLACEMENTS — BAT / EZA / ZOXIDE
# *****************************************************************************

# ----- Bat (better cat) -----

export BAT_THEME="Catppuccin Mocha"

# ---- Eza (better ls) -----

# On macOS eza looks for theme.yml in ~/Library/Application Support/eza and ignores
# XDG_CONFIG_HOME, so point it at the stowed ~/.config/eza (the Catppuccin Mocha theme).
export EZA_CONFIG_DIR="$HOME/.config/eza"

alias ls="eza --color=always --long --git --no-filesize --icons=always --no-time --no-user --no-permissions"

# ---- Zoxide (better cd) ----
eval "$(zoxide init zsh)"

alias cd="z"

# `zi` picks a directory with fzf. Setting _ZO_FZF_OPTS replaces both zoxide's own
# fzf defaults and FZF_DEFAULT_OPTS, so this starts from the Catppuccin fzf colors
# and repeats zoxide's defaults. The only change to those is the preview: eza
# draws it in the terminal palette, where zoxide's plain `ls` has no color on macOS.
export _ZO_FZF_OPTS="$FZF_DEFAULT_OPTS --exact --no-sort --bind=ctrl-z:ignore,btab:up,tab:down --cycle --keep-right --border=sharp --height=45% --info=inline --layout=reverse --tabstop=1 --exit-0 --preview='eza --tree --level=2 --color=always --icons=always {2..}' --preview-window=down,30%,sharp"


# *****************************************************************************
# COMPLETIONS (CARAPACE)
# *****************************************************************************

#  carapace
export CARAPACE_BRIDGES='zsh,fish,bash,inshellisense' # optional
zstyle ':completion:*' format $'\e[2;37mCompleting %d\e[m'
source <(carapace _carapace)
zstyle ':completion:*:git:*' group-order 'main commands' 'alias commands' 'external commands'

#worktrunk
if command -v wt >/dev/null 2>&1; then eval "$(command wt config shell init zsh)"; fi

# Worktree hooks in each repo's .config/wt.toml read these; spelled out here so
# changing one is a single edit. One-off override: WT_AGENTS= wt switch -c x
export WT_TMUX=on                    # tmux session per worktree (off to skip)
export WT_AGENTS="claude opencode"   # agents started in the Agents window ("" for none)
export WT_EDITOR=nvim                # editor in the Editor window
export WT_PROXY=off                   # Caddy route per worktree (off to skip)

# use the defined nodejs version if present in the folder via .nvmrc
chpwd(){
  if [[ -f .nvmrc ]] && (( $+functions[nvm] )); then
    nvm use
  fi
}

# Kaku (sourced below) loads its bundled zsh-autosuggestions unless it sees a
# third-party widget with "autosuggest" in its name. deja's widgets are all deja-*,
# so register one; otherwise both engines would run.
(( $+widgets[deja-accept] )) && zle -N deja-autosuggest

# Same for highlighting: Kaku defers its bundled fast-syntax-highlighting unless a
# function named _zsh_highlight exists, which only zsh-syntax-highlighting defines.
# zsh-patina highlights here, so claim the name.
(( $+commands[zsh-patina] )) && _zsh_highlight() { :; }

[ -f "$HOME/.atuin/bin/env" ] && . "$HOME/.atuin/bin/env"

command -v atuin >/dev/null 2>&1 && eval "$(atuin init zsh)"

# Disable telemetry for pass-cli
PROTON_PASS_DISABLE_TELEMETRY=true

[[ ":$PATH:" != *":$HOME/.config/kaku/zsh/bin:"* ]] && export PATH="$HOME/.config/kaku/zsh/bin:$PATH" # Kaku PATH Integration
[[ -f "$HOME/.config/kaku/zsh/kaku.zsh" ]] && source "$HOME/.config/kaku/zsh/kaku.zsh" # Kaku Shell Integration

# zsh-paste-guard and Kaku's "# query" hook both replace accept-line and both end in the
# builtin .accept-line, so whichever registers last silently disables the other (Kaku
# registers on the first prompt, after the guard). After that, send pastes to the guard
# and every other Enter to Kaku.
_pg_kaku_accept_line() {
  if (( __paste_guard_pasted )); then zle paste-guard-accept-line; else zle kaku-accept-line; fi
}
_pg_kaku_register() {
  zle -N paste-guard-accept-line __paste_guard_accept_line
  zle -N kaku-accept-line _kaku_ai_query_accept_line
  zle -N accept-line _pg_kaku_accept_line
  precmd_functions=("${precmd_functions[@]:#_pg_kaku_register}")
}
(( $+functions[__paste_guard_accept_line] && $+functions[_kaku_ai_query_register_widget] )) && precmd_functions+=(_pg_kaku_register)
# >>> headroom:managed_rtk >>>
_headroom_path=":$PATH:"
while case "$_headroom_path" in *:"/Users/michaelnji/Library/Application Support/Headroom/headroom/bin":*) true ;; *) false ;; esac; do
  _headroom_path=${_headroom_path%%:"/Users/michaelnji/Library/Application Support/Headroom/headroom/bin":*}:${_headroom_path#*:"/Users/michaelnji/Library/Application Support/Headroom/headroom/bin":}
done
_headroom_path=${_headroom_path#:}
_headroom_path=${_headroom_path%:}
export PATH="/Users/michaelnji/Library/Application Support/Headroom/headroom/bin${_headroom_path:+:$_headroom_path}"
unset _headroom_path
# <<< headroom:managed_rtk <<<
# >>> headroom:claude_code >>>
__headroom_up() {
  case ${OSTYPE-} in
    msys*|cygwin*) if [ -x /usr/bin/timeout ]; then
      BASH_ENV= /usr/bin/timeout 1 "${BASH:-bash}" -c ': </dev/tcp/127.0.0.1/6767' 2>/dev/null; return
    fi ;;
  esac
  if [ -n "${ZSH_VERSION-}" ]; then
    local REPLY
    zmodload zsh/net/tcp 2>/dev/null && ztcp 127.0.0.1 6767 2>/dev/null && ztcp -c "$REPLY"
  else
    (: </dev/tcp/127.0.0.1/6767) 2>/dev/null
  fi
}
case ${__headroom_live-} in "$$:"[01]) ;; *) if __headroom_up; then __headroom_live=$$:1; else __headroom_live=$$:0; fi ;; esac
if [ "$__headroom_live" = "$$:1" ]; then export ANTHROPIC_BASE_URL="${ANTHROPIC_BASE_URL:-http://127.0.0.1:6767}"; elif [ "${ANTHROPIC_BASE_URL-}" = http://127.0.0.1:6767 ]; then unset ANTHROPIC_BASE_URL; fi
# /remote-control needs api.anthropic.com; this relaunches the same session without Headroom.
if ! alias claude >/dev/null 2>&1; then eval 'claude() {
  local a; for a in "$@"; do [ "$a" = --remote-control ] && { set -- --settings '\''{"env":{"ANTHROPIC_BASE_URL":"https://api.anthropic.com"}}'\'' "$@"; break; }; done
  if [ -n "${CLAUDE_CONFIG_DIR-}" ] && [ "${CLAUDE_CONFIG_DIR%/}" != "$HOME/.claude" ] && [ -z "${ANTHROPIC_BASE_URL-}" ] &&
    command grep -qs '\''"ANTHROPIC_BASE_URL"[[:space:]]*:[[:space:]]*"http://127.0.0.1:6767"'\'' "$HOME/.claude/settings.json"; then
    ANTHROPIC_BASE_URL=http://127.0.0.1:6767 HEADROOM_RC_RELAUNCHER=tty command claude "$@"
  elif [ "${ANTHROPIC_BASE_URL-}" = http://127.0.0.1:6767 ] && ! __headroom_up; then
    command env -u ANTHROPIC_BASE_URL HEADROOM_RC_RELAUNCHER=tty claude "$@"
  else
    HEADROOM_RC_RELAUNCHER=tty command claude "$@"
  fi
  local rc=$?
  local m="$HOME/.headroom/remote-control/$(command basename "$(command tty 2>/dev/null)" 2>/dev/null)"
  if [ -s "$m" ] && [ -n "$(command find "$m" -mmin -2 2>/dev/null)" ]; then
    local sid; sid=$(command cat "$m"); command rm -f "$m"
    local n=$# v=0
    while [ "$n" -gt 0 ]; do
      a=$1; shift; n=$((n-1))
      if [ "$v" = 1 ]; then v=0; set -- "$@" "$a"; continue; fi
      case $a in
        --model|--permission-mode|--add-dir|--agent|--effort|--fallback-model|--append-system-prompt|--mcp-config|--plugin-dir) v=1; set -- "$@" "$a" ;;
        --model=*|--permission-mode=*|--add-dir=*|--agent=*|--effort=*|--fallback-model=*|--append-system-prompt=*|--mcp-config=*|--plugin-dir=*|--dangerously-skip-permissions|--allow-dangerously-skip-permissions|--strict-mcp-config|--verbose|--ide|--chrome|--no-chrome) set -- "$@" "$a" ;;
      esac
    done
    command claude --settings '\''{"env":{"ANTHROPIC_BASE_URL":"https://api.anthropic.com"}}'\'' "$@" -r "$sid" --remote-control
    return $?
  fi
  return $rc
}'; fi
# <<< headroom:claude_code <<<
# >>> headroom:codex_cli >>>
__headroom_up() {
  case ${OSTYPE-} in
    msys*|cygwin*) if [ -x /usr/bin/timeout ]; then
      BASH_ENV= /usr/bin/timeout 1 "${BASH:-bash}" -c ': </dev/tcp/127.0.0.1/6767' 2>/dev/null; return
    fi ;;
  esac
  if [ -n "${ZSH_VERSION-}" ]; then
    local REPLY
    zmodload zsh/net/tcp 2>/dev/null && ztcp 127.0.0.1 6767 2>/dev/null && ztcp -c "$REPLY"
  else
    (: </dev/tcp/127.0.0.1/6767) 2>/dev/null
  fi
}
case ${__headroom_live-} in "$$:"[01]) ;; *) if __headroom_up; then __headroom_live=$$:1; else __headroom_live=$$:0; fi ;; esac
if [ "$__headroom_live" = "$$:1" ]; then export OPENAI_BASE_URL="${OPENAI_BASE_URL:-http://127.0.0.1:6767/v1}"; elif [ "${OPENAI_BASE_URL-}" = http://127.0.0.1:6767/v1 ]; then unset OPENAI_BASE_URL; fi
if ! alias codex >/dev/null 2>&1 && ! typeset -f codex >/dev/null 2>&1; then eval 'codex() {
  if [ "${OPENAI_BASE_URL-}" = http://127.0.0.1:6767/v1 ] && ! __headroom_up; then
    command env -u OPENAI_BASE_URL codex "$@"
  else
    command codex "$@"
  fi
}'; fi
# <<< headroom:codex_cli <<<
# >>> headroom:grok_build >>>
export GROK_CLI_CHAT_PROXY_BASE_URL=http://127.0.0.1:6767/v1
# <<< headroom:grok_build <<<
