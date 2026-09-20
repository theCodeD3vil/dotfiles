#!/usr/bin/env bash
#
# Set up a new Mac or Ubuntu machine from this repo.
#
# Install-only and re-runnable: every step checks first and only adds what is
# missing. Nothing is upgraded (unless --upgrade) and nothing is ever deleted.
#
# usage: bootstrap/install.sh [options]
#   --dry-run        show what would happen and change nothing
#   --upgrade        let brew bundle upgrade outdated packages too
#   --check-cleanup  list brew packages that are installed but not in the
#                    Brewfiles, then exit (never removes anything)
#   --skip STEP      skip a step; repeat for several. Steps:
#                    preflight prerequisites brew toolchains agents globals omz
#                    stow linux inits finish
#   -h, --help
#
# Must run under bash and work on macOS's bash 3.2, so: no associative arrays,
# no mapfile, no ${var,,}.

# The step_* functions are run through "step_$s" dispatch, which shellcheck can't follow.
# shellcheck disable=SC2329

DRY_RUN=0
UPGRADE=0
CHECK_CLEANUP=0
SKIP=" "
STEPS="preflight prerequisites brew toolchains agents globals omz stow linux inits finish"

# Pinned on 2026-09-20. Bump on purpose, not by accident.
NVM_VERSION="v0.40.7"

BOOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
DOTFILES_DIR=$(cd "$BOOT_DIR/.." && pwd)
BACKUP_DIR="$HOME/.dotfiles-backup/$(date +%Y%m%d-%H%M%S)"
OS=""
STOW_IGNORES=()
BACKED_UP=0

# ---------------------------------------------------------------- helpers ---

say()  { printf '%s\n' "$*"; }
step() { printf '\n==> %s\n' "$*"; }
info() { printf '    %s\n' "$*"; }
warn() { printf '    WARN: %s\n' "$*" >&2; }
die()  { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

usage() { sed -n '3,16p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; }

# Run a command, or only print it under --dry-run.
run() {
  if [ "$DRY_RUN" = 1 ]; then
    printf '    [dry-run] %s\n' "$*"
    return 0
  fi
  "$@"
}

# Download an installer to a temp file, then run it. Piping curl into bash would
# report success on a failed download, because bash just gets empty input.
# usage: fetch_run "VAR=1 VAR2=x" INTERPRETER URL [args...]   (env may be "")
fetch_run() {
  local envs=$1 interp=$2 url=$3 tmp rc
  shift 3
  if [ "$DRY_RUN" = 1 ]; then
    printf '    [dry-run] download %s and run: %s %s %s\n' "$url" "${envs:+$envs }" "$interp" "$*"
    return 0
  fi
  tmp=$(mktemp) || return 1
  if ! curl -fsSL "$url" -o "$tmp"; then
    rm -f "$tmp"
    warn "could not download $url"
    return 1
  fi
  # shellcheck disable=SC2086  # $envs is intentionally split into VAR=value words
  env $envs "$interp" "$tmp" "$@"
  rc=$?
  rm -f "$tmp"
  return "$rc"
}

# Non-comment, non-blank lines of a list file.
list_items() { grep -v '^[[:space:]]*\(#\|$\)' "$1" 2>/dev/null; }

detect_os() {
  case "$(uname -s)" in
    Darwin) OS=mac ;;
    Linux)
      if [ -r /etc/os-release ] && grep -qiE '^ID(_LIKE)?=.*(ubuntu|debian)' /etc/os-release; then
        OS=linux
      else
        die "Linux support is Ubuntu/Debian only (it needs apt)"
      fi
      ;;
    *) die "unsupported OS: $(uname -s)" ;;
  esac
}

brew_bin() {
  local p
  for p in /opt/homebrew/bin/brew /home/linuxbrew/.linuxbrew/bin/brew /usr/local/bin/brew; do
    if [ -x "$p" ]; then
      echo "$p"
      return 0
    fi
  done
  command -v brew
}

load_brew_env() {
  local b
  b=$(brew_bin) || return 1
  eval "$("$b" shellenv)"
}

need_sudo() {
  [ "$DRY_RUN" = 1 ] && return 0
  sudo -n true 2>/dev/null && return 0
  info "sudo password needed"
  sudo -v || die "could not get sudo"
}

pnpm_home_dir() {
  if [ "$OS" = mac ]; then
    echo "$HOME/Library/pnpm"
  else
    echo "${XDG_DATA_HOME:-$HOME/.local/share}/pnpm"
  fi
}

# Environment the later steps rely on, set once up front so a step can be skipped
# (or already done on an earlier run) without breaking the ones after it. Adding a
# directory that does not exist yet is harmless: the installers create them.
# Needs $OS, so call it after detect_os.
prepare_env() {
  load_brew_env 2>/dev/null || true
  export BUN_INSTALL="$HOME/.bun"
  export NVM_DIR="$HOME/.nvm"
  export PNPM_HOME
  PNPM_HOME=$(pnpm_home_dir)
  export PATH="$HOME/.local/bin:$HOME/.opencode/bin:$PNPM_HOME:$BUN_INSTALL/bin:$PATH"
  if [ -s "$NVM_DIR/nvm.sh" ]; then
    # shellcheck source=/dev/null
    . "$NVM_DIR/nvm.sh"
  fi
}

# ------------------------------------------------------------------ steps ---

step_preflight() {
  detect_os
  info "OS: $OS    repo: $DOTFILES_DIR"
  [ "$(id -u)" -ne 0 ] || die "run this as a normal user with sudo, not as root (Homebrew refuses root)"
  [ -f "$BOOT_DIR/Brewfile" ] || die "this is not a dotfiles checkout: $BOOT_DIR/Brewfile is missing"
  have sudo || die "sudo is required"
  have git || die "git is required (on a Mac it comes with the Xcode command line tools)"
}

step_prerequisites() {
  local pkgs missing p
  if [ "$OS" = mac ]; then
    if ! xcode-select -p >/dev/null 2>&1; then
      if [ "$DRY_RUN" = 1 ]; then
        info "[dry-run] would run xcode-select --install and stop until it finishes"
      else
        xcode-select --install >/dev/null 2>&1
        die "finish the Xcode Command Line Tools installer that just opened, then re-run this script"
      fi
    fi
  else
    pkgs=$(list_items "$BOOT_DIR/apt.txt" | tr '\n' ' ')
    missing=""
    for p in $pkgs; do
      dpkg -s "$p" >/dev/null 2>&1 || missing="$missing $p"
    done
    if [ -n "$missing" ]; then
      need_sudo
      run sudo apt-get update
      # shellcheck disable=SC2086  # $missing is a list of package names
      run sudo env DEBIAN_FRONTEND=noninteractive apt-get install -y $missing
    else
      info "apt prerequisites already installed"
    fi
  fi

  if brew_bin >/dev/null 2>&1; then
    info "Homebrew already installed"
  else
    need_sudo
    fetch_run "NONINTERACTIVE=1" bash https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh || return 1
  fi
  if [ "$DRY_RUN" != 1 ]; then
    load_brew_env || die "Homebrew is not usable after the install"
  fi
}

step_brew() {
  local f rc=0 out upflag="--no-upgrade" verb="install"
  if [ "$UPGRADE" = 1 ]; then
    upflag=""
    verb="install or upgrade"
  fi
  if ! load_brew_env 2>/dev/null; then
    if [ "$DRY_RUN" = 1 ]; then
      info "[dry-run] would run brew bundle (Homebrew is not installed yet)"
      return 0
    fi
    warn "Homebrew not found"
    return 1
  fi
  for f in Brewfile Brewfile.mac; do
    [ "$f" = Brewfile.mac ] && [ "$OS" != mac ] && continue
    if [ "$DRY_RUN" = 1 ]; then
      # No auto-update: a dry run must not touch Homebrew's own index either.
      # shellcheck disable=SC2086  # $upflag is empty or one option
      out=$(HOMEBREW_NO_AUTO_UPDATE=1 HOMEBREW_NO_ENV_HINTS=1 brew bundle check $upflag --verbose --file "$BOOT_DIR/$f" 2>&1 | grep '^→' | sed 's/^→ /        /')
      if [ -n "$out" ]; then
        info "[dry-run] $f: brew would $verb:"
        printf '%s\n' "$out"
      else
        info "[dry-run] $f: nothing to $verb"
      fi
    elif [ "$UPGRADE" = 1 ]; then
      brew bundle --file "$BOOT_DIR/$f" || rc=1
    else
      brew bundle --no-upgrade --file "$BOOT_DIR/$f" || rc=1
    fi
  done
  if [ "$rc" != 0 ]; then
    warn "some Brewfile entries failed. On a Mac, App Store apps (mas) need you to sign in to the App Store first. Fix and re-run."
  fi
  return "$rc"
}

step_toolchains() {
  local rc=0

  # bun and pnpm append to ~/.zshrc, which is stowed from the repo, so this step
  # has to run before stow. Whatever they add lands in a file stow will back up.
  if have bun || [ -x "$HOME/.bun/bin/bun" ]; then
    info "bun already installed"
  else
    fetch_run "" bash https://bun.sh/install || rc=1
  fi

  if have pnpm || [ -x "$(pnpm_home_dir)/pnpm" ]; then
    info "pnpm already installed"
  else
    fetch_run "" sh https://get.pnpm.io/install.sh || rc=1
  fi

  # nvm: PROFILE=/dev/null stops its installer appending to ~/.zshrc.
  if [ -s "$NVM_DIR/nvm.sh" ]; then
    info "nvm already installed"
  else
    fetch_run "PROFILE=/dev/null" bash "https://raw.githubusercontent.com/nvm-sh/nvm/$NVM_VERSION/install.sh" || rc=1
  fi
  # default-packages must be linked AFTER the installer: it git-clones into ~/.nvm
  # and fails if that directory already exists. nvm installs everything listed in
  # it after every `nvm install`, which is how npm.txt gets applied.
  if [ -d "$NVM_DIR" ] || [ "$DRY_RUN" = 1 ]; then
    run ln -sfn "$BOOT_DIR/npm.txt" "$NVM_DIR/default-packages"
  fi
  if [ "$DRY_RUN" != 1 ] && [ -s "$NVM_DIR/nvm.sh" ]; then
    # shellcheck source=/dev/null
    . "$NVM_DIR/nvm.sh"
    if [ "$(nvm version 'lts/*' 2>/dev/null)" = "N/A" ]; then
      nvm install --lts || rc=1
    else
      info "an LTS node is already installed"
    fi
    nvm alias default 'lts/*' >/dev/null 2>&1 || true
  elif [ "$DRY_RUN" = 1 ]; then
    info "[dry-run] would run: nvm install --lts (if no LTS node is installed), nvm alias default 'lts/*'"
  fi
  return "$rc"
}

step_agents() {
  local rc=0
  # Claude Code and opencode. The rtk and icm inits need them present, but no login.
  # Skipped when already installed, so a re-run never upgrades them.
  if have claude || [ -x "$HOME/.local/bin/claude" ]; then
    info "claude already installed"
  else
    fetch_run "" bash https://claude.ai/install.sh || rc=1
  fi
  if have opencode || [ -x "$HOME/.opencode/bin/opencode" ]; then
    info "opencode already installed"
  else
    fetch_run "" bash https://opencode.ai/install --no-modify-path || rc=1
  fi
  return "$rc"
}

step_globals() {
  local rc=0 pkg
  # npm globals are handled by nvm (default-packages, see the toolchains step).
  if have bun; then
    for pkg in $(list_items "$BOOT_DIR/bun.txt"); do
      if grep -qF "\"$pkg\"" "$HOME/.bun/install/global/package.json" 2>/dev/null; then
        info "bun: $pkg already installed"
      else
        run bun add -g "$pkg" || { warn "bun add -g $pkg failed"; rc=1; }
      fi
    done
  else
    warn "bun is not available, skipping bun.txt"
    [ "$DRY_RUN" = 1 ] || rc=1
  fi

  if have pnpm; then
    for pkg in $(list_items "$BOOT_DIR/pnpm.txt"); do
      if pnpm ls -g --depth=0 2>/dev/null | awk '{print $1}' | grep -Fxq "$pkg"; then
        info "pnpm: $pkg already installed"
      else
        run pnpm add -g "$pkg" || { warn "pnpm add -g $pkg failed"; rc=1; }
      fi
    done
  else
    warn "pnpm is not available, skipping pnpm.txt"
    [ "$DRY_RUN" = 1 ] || rc=1
  fi
  return "$rc"
}

step_omz() {
  local rc=0 zdir="$HOME/.oh-my-zsh" name url dest
  if [ -d "$zdir" ]; then
    info "oh-my-zsh already installed"
  else
    # A plain clone, not its installer: the installer replaces ~/.zshrc.
    run git clone --depth=1 https://github.com/ohmyzsh/ohmyzsh.git "$zdir" || return 1
  fi
  while read -r name url; do
    [ -n "$name" ] || continue
    dest="$zdir/custom/plugins/$name"
    if [ -d "$dest" ]; then
      info "omz plugin $name already installed"
    else
      run git clone --depth=1 "$url" "$dest" || { warn "could not clone $name"; rc=1; }
    fi
  done < <(list_items "$BOOT_DIR/omz-plugins.txt")
  return "$rc"
}

stow_run() {
  # $1 = simulate | real. Output and status are the caller's to inspect.
  local flag=""
  [ "$1" = simulate ] && flag="--simulate"
  # shellcheck disable=SC2086  # $flag is empty or a single option
  (cd "$DOTFILES_DIR" && stow $flag -t "$HOME" "${STOW_IGNORES[@]}" . AI 2>&1)
}

# Move every real file that is in stow's way to $BACKUP_DIR (same relative path).
# Never --adopt: that would pull the machine's file into the repo.
resolve_conflicts() {
  local round=0 out paths p
  while [ "$round" -lt 6 ]; do
    out=$(stow_run simulate)
    # stow 2.4.1 wording: "cannot stow <src> over existing target <path> since neither a link nor a directory ..."
    paths=$(printf '%s\n' "$out" | sed -n 's/^  \* cannot stow .* over existing target \(.*\) since neither a link nor a directory.*$/\1/p')
    if [ -z "$paths" ]; then
      if printf '%s\n' "$out" | grep -qE '^(stow: ERROR|WARNING! stowing)'; then
        printf '%s\n' "$out" | sed 's/^/      /' >&2
        return 1
      fi
      return 0
    fi
    while IFS= read -r p; do
      [ -n "$p" ] || continue
      if [ "$DRY_RUN" = 1 ]; then
        info "[dry-run] would move ~/$p to $BACKUP_DIR/$p"
      else
        mkdir -p "$(dirname "$BACKUP_DIR/$p")" && mv "$HOME/$p" "$BACKUP_DIR/$p" || return 1
        BACKED_UP=1
        info "backed up ~/$p -> $BACKUP_DIR/$p"
      fi
    done <<EOF
$paths
EOF
    [ "$DRY_RUN" = 1 ] && return 0
    round=$((round + 1))
  done
  warn "still conflicts after $round rounds"
  return 1
}

step_stow() {
  local out
  if ! have stow; then
    if [ "$DRY_RUN" = 1 ]; then
      info "[dry-run] stow is not installed yet, so the link plan can't be simulated"
      return 0
    fi
    warn "stow not found (did brew bundle fail?)"
    return 1
  fi
  if [ "$OS" = linux ]; then
    # Mac-only files. Stow's command-line --ignore is a regex matched against the
    # whole relative path, unanchored at the start. Anchored ^/path forms are
    # silently ignored, so top-level names use ^name$ and nested ones a plain suffix.
    STOW_IGNORES=(
      --ignore='^Library$'
      --ignore='^\.wezterm\.lua$'
      --ignore='^vira-theme-for-terminals$'
      --ignore='ghostty'
      --ignore='sketchybar'
      --ignore='\.aerospace\.toml'
    )
  fi
  # Real directories BEFORE stow. If ~/.config/opencode does not exist, stow folds it
  # into one symlink to the repo, and rtk/icm would then write plugins/ and skills/
  # into the repo. With a real directory only the two tracked files get linked.
  run mkdir -p "$HOME/.config" "$HOME/.config/opencode"

  resolve_conflicts || return 1
  if [ "$DRY_RUN" = 1 ]; then
    info "[dry-run] stow simulation reports no other problems"
    return 0
  fi
  out=$(stow_run real) || { printf '%s\n' "$out" | sed 's/^/      /' >&2; return 1; }
  info "stowed into $HOME"
  if [ "$BACKED_UP" = 1 ]; then
    info "files that were in the way are in $BACKUP_DIR"
  fi
}

step_linux() {
  if [ "$OS" != linux ]; then
    info "not Linux, nothing to do"
    return 0
  fi
  # UNTESTED on a real VPS: .zshrc's awesome-lazy-zsh block is regenerated by that
  # tool and hardcodes /opt/homebrew, so point that path at Linuxbrew.
  if [ ! -e /opt/homebrew ]; then
    need_sudo
    run sudo ln -s /home/linuxbrew/.linuxbrew /opt/homebrew
  fi
  # UNTESTED: the same block sources this iTerm file unguarded.
  if [ ! -e "$HOME/.iterm2_shell_integration.zsh" ]; then
    run touch "$HOME/.iterm2_shell_integration.zsh"
  fi
}

step_inits() {
  local rc=0
  run mkdir -p "$HOME/.claude"    # rtk init exits 1 without it

  if have rtk; then
    if [ -f "$HOME/.claude/RTK.md" ] && [ -f "$HOME/.config/opencode/plugins/rtk.ts" ]; then
      info "rtk already initialised"
    else
      run rtk init --global --opencode --auto-patch || rc=1
    fi
  else
    warn "rtk is not installed"
    [ "$DRY_RUN" = 1 ] || rc=1
  fi

  if have icm; then
    # icm finds agents by binary on PATH. Without them it exits 0 and configures nothing.
    have claude   || warn "claude is not on PATH: icm init will skip Claude Code"
    have opencode || warn "opencode is not on PATH: icm init will skip opencode"
    if [ -f "$HOME/.claude/commands/recall.md" ] && [ -f "$HOME/.config/opencode/plugins/icm.ts" ]; then
      info "icm already initialised"
    else
      run icm init || rc=1
    fi
  else
    warn "icm is not installed"
    [ "$DRY_RUN" = 1 ] || rc=1
  fi

  # No-op once .zshrc is stowed (it already has the integration line).
  if have wt; then
    run wt config shell install zsh || rc=1
  fi
  if have awesome-lazy-zsh; then
    info "awesome-lazy-zsh --doctor:"
    awesome-lazy-zsh --doctor 2>&1 | sed 's/^/        /' || true
  fi
  return "$rc"
}

step_finish() {
  if [ "$OS" = linux ] && [ "$(basename "${SHELL:-}")" != zsh ] && [ -x /usr/bin/zsh ]; then
    need_sudo
    run sudo chsh -s /usr/bin/zsh "$USER" || warn "chsh failed; set your login shell to zsh by hand"
  fi
  if [ -n "$(git -C "$DOTFILES_DIR" status --porcelain 2>/dev/null)" ]; then
    warn "the repo has uncommitted changes. Fine if you are editing it; otherwise an installer edited a stowed file. Check: git -C $DOTFILES_DIR diff"
  fi
  cat <<'EOF'

    Still manual (none of it can be scripted):
      - log in:            claude   and   opencode
      - GitHub:            gh auth login
      - SSH keys and the SSH agent
      - macOS only:        sign in to the App Store, then re-run for the mas apps
      - open a new terminal (or run: exec zsh) so the new PATH and shell config load
EOF
}

# ------------------------------------------------------------ check-cleanup ---

check_cleanup() {
  local tmp
  detect_os
  load_brew_env || die "Homebrew is not installed"
  tmp=$(mktemp)
  cat "$BOOT_DIR/Brewfile" > "$tmp"
  if [ "$OS" = mac ]; then
    printf '\n' >> "$tmp"
    cat "$BOOT_DIR/Brewfile.mac" >> "$tmp"
  fi
  say "Installed but not in the Brewfiles (nothing is removed):"
  HOMEBREW_NO_AUTO_UPDATE=1 HOMEBREW_NO_ENV_HINTS=1 brew bundle cleanup --file "$tmp" || true
  rm -f "$tmp"
}

# ------------------------------------------------------------------- main ---

main() {
  local s known ok results="" failed=0
  while [ $# -gt 0 ]; do
    case "$1" in
      --dry-run)       DRY_RUN=1 ;;
      --upgrade)       UPGRADE=1 ;;
      --check-cleanup) CHECK_CLEANUP=1 ;;
      --skip)
        [ $# -ge 2 ] || die "--skip needs a step name"
        known=0
        for s in $STEPS; do [ "$s" = "$2" ] && known=1; done
        [ "$known" = 1 ] || die "unknown step '$2'. Steps: $STEPS"
        SKIP="$SKIP$2 "
        shift
        ;;
      -h|--help) usage; exit 0 ;;
      *) die "unknown option: $1 (try --help)" ;;
    esac
    shift
  done

  if [ "$CHECK_CLEANUP" = 1 ]; then
    check_cleanup
    exit 0
  fi
  [ "$DRY_RUN" = 1 ] && say "DRY RUN: nothing will be changed."
  detect_os
  prepare_env

  for s in $STEPS; do
    case "$SKIP" in
      *" $s "*)
        results="$results\n  skipped  $s"
        continue
        ;;
    esac
    step "$s"
    ok=1
    "step_$s" || ok=0
    if [ "$ok" = 1 ]; then
      results="$results\n  done     $s"
    else
      results="$results\n  FAILED   $s"
      failed=1
    fi
  done

  printf '\nSummary:'
  # shellcheck disable=SC2059  # $results carries \n sequences on purpose
  printf "$results\n"
  if [ "$failed" = 1 ]; then
    say "Some steps failed. Read the messages above, fix them, and re-run: finished steps are skipped."
  fi
  exit "$failed"
}

main "$@"
