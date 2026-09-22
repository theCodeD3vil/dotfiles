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

# bun completions
[ -s "$HOME/.bun/_bun" ] && source "$HOME/.bun/_bun"

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

# *****************************************************************************
# GUM PICKERS — pick instead of type, guard instead of just run
# *****************************************************************************

# Re-sourcing this file inside a shell that already has gco/gbclean aliased
# (from a previous load, before the managed block's unalias runs again below)
# would otherwise make zsh choke defining a function under an aliased name.
unalias gco gbclean 2>/dev/null

# git: fuzzy-checkout a local branch
gco() { git checkout "$(git branch --sort=-committerdate | sed 's/^[* ] //' | gum filter --placeholder 'branch')" }

# git: multi-select merged local branches to delete
gbclean() {
  local br
  br=$(git branch --merged | grep -vE '^\*|main|master' | gum choose --no-limit)
  [ -n "$br" ] || return 0
  gum confirm "delete: $(echo "$br" | tr '\n' ' ')?" && echo "$br" | xargs git branch -d
}

# gh: pick an open PR, open it in the browser
ghpv() { gh pr list --json number,title -q '.[]|"\(.number)\t\(.title)"' | gum filter | cut -f1 | xargs -r gh pr view --web }

# docker: pick a running container to tail or shell into
dlogs() { docker ps --format '{{.Names}}' 2>/dev/null | gum filter | xargs -r docker logs -f }
dsh()   { docker ps --format '{{.Names}}' 2>/dev/null | gum filter | xargs -r -I{} docker exec -it {} sh }

# worktrunk: pick a worktree branch to switch to
wtsw() { wt list --format json 2>/dev/null | jq -r '.items[] | select(.branch != null) | .branch' | gum filter | xargs -r wt switch }

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
brmv() { brew leaves | gum filter --placeholder 'uninstall which?' | xargs -r brew uninstall }

# guarded rm -rf
rmi() { gum confirm "rm -rf $*?" && rm -rf "$@" }

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

# Completions that bootstrap/install.sh generates into ~/.zfunc (pass-cli ships a
# generator, not a file). It must be on fpath before the block below: oh-my-zsh
# runs compinit inside it.
fpath=(~/.zfunc $fpath)

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
plugins=(git git-flow npm nvm docker docker-compose vscode extract dotenv ssh-agent node gitfast z thefuck zsh-autosuggestions zsh-syntax-highlighting)
# Complete selection for profiles (includes aliases/custom plugins)
# awesome-lazy-zsh-plugins=["git","git-flow","npm","nvm","docker","docker-compose","vscode","extract","dotenv","ssh-agent","node","gitfast","z","thefuck","zsh-autosuggestions","zsh-syntax-highlighting","python","golang","rust","java","git-extras","ssh","directories","history-search","flutter"]

# Load Oh My Zsh
source $ZSH/oh-my-zsh.sh

# Homebrew PATH for Apple Silicon
export PATH="/opt/homebrew/bin:$PATH"

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

# iterm2 integration is also sourced inside the managed block
# above; this guarded re-source is a harmless no-op belt-and-
# braces left over from before that block existed.
test -e "${HOME}/.iterm2_shell_integration.zsh" && source "${HOME}/.iterm2_shell_integration.zsh"
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
# CATPPUCCIN MOCHA PALETTE (shared by fzf, bat, zsh-syntax-highlighting)
# *****************************************************************************

ctp_base="#1e1e2e" ctp_mantle="#181825" ctp_surface0="#313244" ctp_surface1="#45475a"
ctp_overlay0="#6c7086" ctp_text="#cdd6f4"
ctp_red="#f38ba8" ctp_peach="#fab387" ctp_yellow="#f9e2af" ctp_green="#a6e3a1"
ctp_teal="#94e2d5" ctp_blue="#89b4fa" ctp_mauve="#cba6f7" ctp_pink="#f5c2e7"

# *****************************************************************************
# FZF
# *****************************************************************************

# setup fzf keybindings and completions
eval "$(fzf --zsh)"

# fzf theme — Catppuccin Mocha
export FZF_DEFAULT_OPTS="--color=fg:${ctp_text},bg:${ctp_base},hl:${ctp_mauve},fg+:${ctp_text},bg+:${ctp_surface1},hl+:${ctp_mauve},info:${ctp_blue},prompt:${ctp_teal},pointer:${ctp_pink},marker:${ctp_peach},spinner:${ctp_pink},header:${ctp_teal}"


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

alias ls="eza --color=always --long --git --no-filesize --icons=always --no-time --no-user --no-permissions"

# ---- Zoxide (better cd) ----
eval "$(zoxide init zsh)"

alias cd="z"


# *****************************************************************************
# COMPLETIONS (CARAPACE)
# *****************************************************************************

#  carapace
autoload -U compinit && compinit
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

# ZSH zsh-syntax-highlighting configuration
ZSH_HIGHLIGHT_HIGHLIGHTERS=(main brackets pattern)

# Homebrew (macOS, then Linuxbrew) first, then the distro package.
for _zsh_hl in \
  /opt/homebrew/share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh \
  /home/linuxbrew/.linuxbrew/share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh \
  /usr/share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh; do
  if [ -f "$_zsh_hl" ]; then source "$_zsh_hl"; break; fi
done
unset _zsh_hl

typeset -A ZSH_HIGHLIGHT_PATTERNS
ZSH_HIGHLIGHT_PATTERNS+=('rm -rf *' 'fg=white,bold,bg=red')
ZSH_HIGHLIGHT_MAXLENGTH=512
ZSH_HIGHLIGHT_DIRS_BLACKLIST+=(/mnt/nfs-share)

# Catppuccin Mocha colors (ansi mapping: magenta=Pink, cyan=Teal; palette defined above near FZF)
ZSH_HIGHLIGHT_STYLES[alias]="fg=$ctp_pink,bold"
ZSH_HIGHLIGHT_STYLES[path]="fg=$ctp_teal"
ZSH_HIGHLIGHT_STYLES[globbing]='none'

[ -f "$HOME/.atuin/bin/env" ] && . "$HOME/.atuin/bin/env"

command -v atuin >/dev/null 2>&1 && eval "$(atuin init zsh)"

# Disable telemetry for pass-cli
PROTON_PASS_DISABLE_TELEMETRY=true
