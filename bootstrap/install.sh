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
#   --plain          no colour, spinners or bars. Chosen automatically when the
#                    output is not a terminal or NO_COLOR is set.
#   --demo           show the progress display with fake tasks; changes nothing
#   -h, --help
#
# Every real run is logged to ~/.cache/dotfiles-install/<timestamp>.log
#
# Must run under bash and work on macOS's bash 3.2, so: no associative arrays,
# no mapfile, no ${var,,}.

# The step_* functions are run through "step_$s" dispatch, which shellcheck can't follow.
# shellcheck disable=SC2329

DRY_RUN=0
UPGRADE=0
CHECK_CLEANUP=0
PLAIN=0
DEMO=0
SKIP=" "
STEPS="preflight prerequisites brew toolchains agents globals omz stow linux inits finish"

# Pinned on 2026-09-20. Bump on purpose, not by accident.
NVM_VERSION="v0.40.7"
# Immutable Homebrew/install commit, pinned 2026-09-21. Bump on purpose.
HOMEBREW_INSTALL_COMMIT="b41c8e7b3588e2899974119faf3b2a897428648d"

BOOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
DOTFILES_DIR=$(cd "$BOOT_DIR/.." && pwd)
BACKUP_DIR="$HOME/.dotfiles-backup/$(date +%Y%m%d-%H%M%S)"
LOG_DIR="$HOME/.cache/dotfiles-install"
LOG_FILE=/dev/null
# Only tests override this, to exercise the Linux branches from another OS.
OS_RELEASE_FILE="${DOTFILES_OS_RELEASE:-/etc/os-release}"
OS=""
STOW_IGNORES=()
BACKED_UP=0

# UI state. Everything is empty until init_ui decides between fancy and plain.
UI_FANCY=0
COLS=80
ESC=""
C_RESET="" C_BOLD="" C_TEAL="" C_GREEN="" C_RED="" C_YELLOW="" C_MAUVE="" C_GREY=""
CLR="" CURSOR_HIDE="" CURSOR_SHOW=""
FILL="#" EMPTY="-" OK="ok" FAIL="x" SKIPPED="-" ARROW=">" WARN="!" DOT="-" ELL="..."
BOX_TL="+" BOX_BL="+" BOX_H="-" BOX_V="|"
FRAMES=("|" "/" "-" "\\")
BG_PID=""
SUDO_KEEPALIVE_PID=""
SPIN_TOTAL=""
SPIN_REGEX=""
RUN_START=$SECONDS
SUMMARY=""

# `brew bundle` prints one "Using <name>" or "Installing <name>" line per entry.
BREW_PROGRESS_REGEX='^(Using|Installing|Upgrading|Tapping|Skipping) [^ ]+$'

# ------------------------------------------------------------------- ui ---

init_ui() {
  local cs
  UI_FANCY=0
  if [ "$PLAIN" != 1 ] && [ -t 1 ] && [ -z "${NO_COLOR:-}" ] && [ "${TERM:-dumb}" != dumb ]; then
    UI_FANCY=1
  fi
  [ "$UI_FANCY" = 1 ] || return 0

  ESC=$'\033'
  C_RESET="${ESC}[0m"
  C_BOLD="${ESC}[1m"
  CLR="${ESC}[2K"
  CURSOR_HIDE="${ESC}[?25l"
  CURSOR_SHOW="${ESC}[?25h"
  case "${COLORTERM:-}" in
    *truecolor*|*24bit*)
      # Catppuccin Mocha: the palette the rest of these dotfiles use.
      C_TEAL="${ESC}[38;2;148;226;213m"
      C_GREEN="${ESC}[38;2;166;227;161m"
      C_RED="${ESC}[38;2;243;139;168m"
      C_YELLOW="${ESC}[38;2;249;226;175m"
      C_MAUVE="${ESC}[38;2;203;166;247m"
      C_GREY="${ESC}[38;2;108;112;134m"
      ;;
    *)
      C_TEAL="${ESC}[38;5;115m"
      C_GREEN="${ESC}[38;5;114m"
      C_RED="${ESC}[38;5;211m"
      C_YELLOW="${ESC}[38;5;223m"
      C_MAUVE="${ESC}[38;5;183m"
      C_GREY="${ESC}[38;5;244m"
      ;;
  esac

  cs="${LC_ALL:-${LC_CTYPE:-${LANG:-}}}"
  case "$cs" in
    *[Uu][Tt][Ff]-8*|*[Uu][Tt][Ff]8*)
      FILL="█" EMPTY="░" OK="✔" FAIL="✘" SKIPPED="○" ARROW="▸" WARN="⚠" DOT="·" ELL="…"
      BOX_TL="┏" BOX_BL="┗" BOX_H="━" BOX_V="┃"
      FRAMES=(⠋ ⠙ ⠹ ⠸ ⠼ ⠴ ⠦ ⠧ ⠇ ⠏)
      ;;
  esac

  # $COLUMNS is not exported to scripts, and tput can't see the terminal from
  # inside $( ), so ask the tty directly.
  COLS=${COLUMNS:-}
  if [ -z "$COLS" ]; then
    COLS=$(stty size 2>/dev/null </dev/tty | awk '{print $2}')
  fi
  case "$COLS" in ''|*[!0-9]*) COLS=80 ;; esac
  [ "$COLS" -lt 60 ] && COLS=60
  [ "$COLS" -gt 110 ] && COLS=110
  return 0
}

log_plain() { printf '%s\n' "$*" >> "$LOG_FILE"; }
say()  { printf '%s\n' "$*"; log_plain "$*"; }
info() { printf '    %s%s%s %s\n' "$C_GREY" "$DOT" "$C_RESET" "$*"; log_plain "    $*"; }
warn() { printf '    %s%s %s%s\n' "$C_YELLOW" "$WARN" "$*" "$C_RESET" >&2; log_plain "    WARN: $*"; }
dry()  { printf '    %s[dry-run]%s %s\n' "$C_TEAL" "$C_RESET" "$*"; }
die()  { cleanup_ui; printf '\n  %s%s %s%s\n' "$C_RED" "$FAIL" "$*" "$C_RESET" >&2; log_plain "ERROR: $*"; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

usage() {
  awk 'NR >= 3 { if ($0 ~ /^# Must run under bash/) exit; print }' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
}

# Progress bar: bar PERCENT WIDTH
bar() {
  local pct=$1 w=$2 filled i f="" e=""
  filled=$((pct * w / 100))
  i=0
  while [ "$i" -lt "$w" ]; do
    if [ "$i" -lt "$filled" ]; then f="$f$FILL"; else e="$e$EMPTY"; fi
    i=$((i + 1))
  done
  printf '%s%s%s%s%s' "$C_TEAL" "$f" "$C_GREY" "$e" "$C_RESET"
}

fmt_secs() {
  local s=$1
  if [ "$s" -ge 3600 ]; then
    printf '%dh%02dm' $((s / 3600)) $((s % 3600 / 60))
  elif [ "$s" -ge 60 ]; then
    printf '%dm%02ds' $((s / 60)) $((s % 60))
  else
    printf '%ds' "$s"
  fi
}

# Shorten TEXT to at most N columns.
trunc() {
  local s=$1 n=$2
  if [ "$n" -lt 4 ]; then return 0; fi
  if [ "${#s}" -gt "$n" ]; then
    printf '%s%s' "${s:0:$((n - 1))}" "$ELL"
  else
    printf '%s' "$s"
  fi
}

# Last non-empty line of a growing log, with ANSI codes and carriage returns
# (curl progress meters) stripped. Reads only the tail, so it stays cheap.
last_line() {
  tail -c 600 "$1" 2>/dev/null | tr '\r' '\n' | sed "s/${ESC}\[[0-9;?]*[A-Za-z]//g" | grep -v '^[[:space:]]*$' | tail -n 1
}

kill_tree() {
  local p=$1 c
  for c in $(pgrep -P "$p" 2>/dev/null); do
    kill_tree "$c"
  done
  kill "$p" 2>/dev/null
  return 0
}

cleanup_ui() {
  if [ -n "$BG_PID" ]; then
    kill_tree "$BG_PID"
    BG_PID=""
  fi
  if [ -n "$SUDO_KEEPALIVE_PID" ]; then
    kill "$SUDO_KEEPALIVE_PID" 2>/dev/null
    SUDO_KEEPALIVE_PID=""
    sudo -k 2>/dev/null || true
  fi
  if [ "$UI_FANCY" = 1 ]; then
    printf '%s' "$CURSOR_SHOW"
  fi
  return 0
}

on_interrupt() {
  cleanup_ui
  printf '\n  %s%s interrupted%s\n' "$C_YELLOW" "$WARN" "$C_RESET"
  exit 130
}

# Run a command with a spinner, its elapsed time and its latest output line. Output
# is captured (and appended to the log); on failure the last lines are shown.
# With SPIN_TOTAL and SPIN_REGEX set, also draws a bar of matching lines / total.
# Plain mode just streams the output. Returns the command's exit status.
spin() {
  local label=$1 log start rc i=0 n=0 frame elapsed last line pct used avail label_t
  shift
  start=$SECONDS

  if [ "$UI_FANCY" != 1 ]; then
    printf '    %s ...\n' "$label"
    ( "$@" ) 2>&1 | tee -a "$LOG_FILE" | sed 's/^/        /'
    rc=${PIPESTATUS[0]}
    if [ "$rc" = 0 ]; then
      printf '    %s %s (%s)\n' "$OK" "$label" "$(fmt_secs $((SECONDS - start)))"
    else
      printf '    %s %s failed (exit %s)\n' "$FAIL" "$label" "$rc"
    fi
    return "$rc"
  fi

  log=$(mktemp) || return 1
  label_t=$(trunc "$label" 44)
  # stdin from /dev/null: nothing behind the spinner may wait for the keyboard.
  ( "$@" ) >"$log" 2>&1 </dev/null &
  BG_PID=$!
  printf '%s' "$CURSOR_HIDE"

  while kill -0 "$BG_PID" 2>/dev/null; do
    frame=${FRAMES[$((i % ${#FRAMES[@]}))]}
    elapsed=$(fmt_secs $((SECONDS - start)))
    used=$((4 + 2 + ${#label_t} + 2 + ${#elapsed}))
    line="    ${C_TEAL}${frame}${C_RESET} ${label_t}  ${C_GREY}${elapsed}${C_RESET}"
    if [ -n "$SPIN_TOTAL" ] && [ "$SPIN_TOTAL" -gt 0 ] 2>/dev/null; then
      n=$(grep -cE "$SPIN_REGEX" "$log" 2>/dev/null)
      n=${n:-0}
      if [ "$n" -gt "$SPIN_TOTAL" ]; then n=$SPIN_TOTAL; fi
      pct=$((n * 100 / SPIN_TOTAL))
      line="$line  $(bar "$pct" 20) ${C_GREY}${n}/${SPIN_TOTAL}${C_RESET}"
      used=$((used + 2 + 20 + 1 + ${#n} + 1 + ${#SPIN_TOTAL}))
    fi
    avail=$((COLS - used - 4))
    if [ "$avail" -ge 10 ]; then
      last=$(last_line "$log")
      if [ -n "$last" ]; then
        line="$line  ${C_GREY}$(trunc "$last" "$avail")${C_RESET}"
      fi
    fi
    printf '\r%s%s' "$CLR" "$line"
    i=$((i + 1))
    sleep 0.1
  done

  wait "$BG_PID"
  rc=$?
  BG_PID=""
  elapsed=$(fmt_secs $((SECONDS - start)))
  printf '\r%s' "$CLR"
  if [ "$rc" = 0 ]; then
    printf '    %s%s%s %s  %s%s%s\n' "$C_GREEN" "$OK" "$C_RESET" "$label_t" "$C_GREY" "$elapsed" "$C_RESET"
  else
    printf '    %s%s%s %s  %s%s%s\n' "$C_RED" "$FAIL" "$C_RESET" "$label_t" "$C_GREY" "$elapsed" "$C_RESET"
    tail -n 40 "$log" | tr '\r' '\n' | sed "s/${ESC}\[[0-9;?]*[A-Za-z]//g" | grep -v '^[[:space:]]*$' | tail -n 15 |
      while IFS= read -r last; do
        printf '        %s%s%s\n' "$C_GREY" "$(trunc "$last" $((COLS - 10)))" "$C_RESET"
      done
    if [ "$LOG_FILE" != /dev/null ]; then
      printf '        %sfull output: %s%s\n' "$C_GREY" "$LOG_FILE" "$C_RESET"
    fi
  fi
  { printf '=== %s (exit %s)\n' "$label" "$rc"; cat "$log"; } >> "$LOG_FILE"
  rm -f "$log"
  printf '%s' "$CURSOR_SHOW"
  return "$rc"
}

# spin with a progress bar: spin_progress TOTAL REGEX LABEL CMD...
spin_progress() {
  local rc
  SPIN_TOTAL=$1
  SPIN_REGEX=$2
  shift 2
  spin "$@"
  rc=$?
  SPIN_TOTAL=""
  SPIN_REGEX=""
  return "$rc"
}

step_desc() {
  case "$1" in
    preflight)     echo "check the OS, sudo and this checkout" ;;
    prerequisites) echo "Xcode tools or apt basics, then Homebrew" ;;
    brew)          echo "install everything in the Brewfiles" ;;
    toolchains)    echo "bun, pnpm and nvm (Node LTS plus npm.txt)" ;;
    agents)        echo "the Claude Code and opencode CLIs" ;;
    globals)       echo "global bun and pnpm packages" ;;
    omz)           echo "oh-my-zsh and its plugins" ;;
    stow)          echo "link the dotfiles into your home directory" ;;
    linux)         echo "Ubuntu-only shell fixes" ;;
    inits)         echo "rtk, icm and worktrunk setup" ;;
    finish)        echo "login shell and a last check" ;;
  esac
}

step_header() {
  local name=$1 idx=$2 total=$3 pct
  pct=$(((idx - 1) * 100 / total))
  printf '\n  %s%s%s %s%-14s%s %s%2d/%d%s  ' "$C_MAUVE" "$ARROW" "$C_RESET" "$C_BOLD" "$name" "$C_RESET" "$C_GREY" "$idx" "$total" "$C_RESET"
  bar "$pct" 24
  printf ' %s%3d%%%s\n' "$C_GREY" "$pct" "$C_RESET"
  printf '      %s%s%s\n' "$C_GREY" "$(step_desc "$name")" "$C_RESET"
  log_plain ""
  log_plain "== [$idx/$total] $name"
}

print_banner() {
  local osname mode="live"
  if [ "$OS" = mac ]; then
    osname="macOS $(sw_vers -productVersion 2>/dev/null)"
  elif [ -r "$OS_RELEASE_FILE" ]; then
    # shellcheck source=/dev/null
    osname=$(. "$OS_RELEASE_FILE" && printf '%s' "${PRETTY_NAME:-Linux}")
  else
    osname="${OS:-unknown}"
  fi
  [ "$DRY_RUN" = 1 ] && mode="dry run (changes nothing)"
  printf '\n  %s%s%s%s%s %sdotfiles bootstrap%s\n' "$C_MAUVE" "$BOX_TL" "$BOX_H" "$BOX_H" "$C_RESET" "$C_BOLD" "$C_RESET"
  printf '  %s%s%s  %s\n' "$C_MAUVE" "$BOX_V" "$C_RESET" "$osname"
  printf '  %s%s%s  %s%s%s\n' "$C_MAUVE" "$BOX_V" "$C_RESET" "$C_GREY" "$DOTFILES_DIR" "$C_RESET"
  printf '  %s%s%s  %s%s%s\n' "$C_MAUVE" "$BOX_V" "$C_RESET" "$C_GREY" "$mode" "$C_RESET"
  printf '  %s%s%s%s%s%s\n' "$C_MAUVE" "$BOX_BL" "$BOX_H" "$BOX_H" "$BOX_H" "$C_RESET"
  log_plain "dotfiles bootstrap: $osname, $DOTFILES_DIR, $mode"
}

# SUMMARY holds one "status|name|seconds" line per step.
record() { SUMMARY="$SUMMARY${SUMMARY:+$'\n'}$1|$2|$3"; }

print_summary() {
  local status name secs ndone=0 nfail=0 nskip=0 icon color note total pad
  total=$((SECONDS - RUN_START))
  printf '\n  %s%s%s%s%s %ssummary%s\n' "$C_MAUVE" "$BOX_TL" "$BOX_H" "$BOX_H" "$C_RESET" "$C_BOLD" "$C_RESET"
  while IFS='|' read -r status name secs; do
    [ -n "$status" ] || continue
    case "$status" in
      done)    icon=$OK;      color=$C_GREEN;  note=$(fmt_secs "$secs"); ndone=$((ndone + 1)) ;;
      failed)  icon=$FAIL;    color=$C_RED;    note="failed after $(fmt_secs "$secs")"; nfail=$((nfail + 1)) ;;
      *)       icon=$SKIPPED; color=$C_GREY;   note="skipped"; nskip=$((nskip + 1)) ;;
    esac
    pad=""
    if [ "${#icon}" -lt 2 ]; then pad=" "; fi
    printf '  %s%s%s  %s%s%s%s %s%-14s%s %s%s%s\n' "$C_MAUVE" "$BOX_V" "$C_RESET" "$color" "$icon" "$C_RESET" "$pad" "$C_RESET" "$name" "$C_RESET" "$C_GREY" "$note" "$C_RESET"
  done <<EOF
$SUMMARY
EOF
  printf '  %s%s%s%s%s ' "$C_MAUVE" "$BOX_BL" "$BOX_H" "$BOX_H" "$C_RESET"
  bar 100 16
  printf '  %s%d done, %d failed, %d skipped in %s%s\n' "$C_GREY" "$ndone" "$nfail" "$nskip" "$(fmt_secs "$total")" "$C_RESET"
  log_plain "summary: $ndone done, $nfail failed, $nskip skipped in $(fmt_secs "$total")"
  if [ "$LOG_FILE" != /dev/null ]; then
    printf '  %s  log: %s%s\n' "$C_GREY" "$LOG_FILE" "$C_RESET"
  fi
}

print_next_steps() {
  printf '\n  %s%s next steps%s  %s(none of these can be scripted)%s\n' "$C_MAUVE" "$ARROW" "$C_RESET" "$C_GREY" "$C_RESET"
  printf '      %s%s%s log in to %sclaude%s and %sopencode%s\n' "$C_TEAL" "$DOT" "$C_RESET" "$C_BOLD" "$C_RESET" "$C_BOLD" "$C_RESET"
  printf '      %s%s%s GitHub: %sgh auth login%s\n' "$C_TEAL" "$DOT" "$C_RESET" "$C_BOLD" "$C_RESET"
  printf '      %s%s%s SSH keys and the SSH agent\n' "$C_TEAL" "$DOT" "$C_RESET"
  printf '      %s%s%s macOS only: sign in to the App Store, then re-run for the mas apps\n' "$C_TEAL" "$DOT" "$C_RESET"
  printf '      %s%s%s open a new terminal (or run %sexec zsh%s) so the new PATH and shell config load\n\n' "$C_TEAL" "$DOT" "$C_RESET" "$C_BOLD" "$C_RESET"
}

# ---------------------------------------------------------------- helpers ---

# A long-running command: spinner in a real run, printed in a dry run.
# run_as LABEL CMD...
run_as() {
  local label=$1
  shift
  if [ "$DRY_RUN" = 1 ]; then
    dry "$*"
    return 0
  fi
  spin "$label" "$@"
}

# A quick command that needs no spinner (mkdir, ln, touch).
quiet() {
  if [ "$DRY_RUN" = 1 ]; then
    dry "$*"
    return 0
  fi
  "$@"
}

# Download an installer to a temp file, then run it. Piping curl into bash would
# report success on a failed download, because bash just gets empty input.
_fetch_and_run() {
  local envs=$1 interp=$2 url=$3 tmp rc
  shift 3
  tmp=$(mktemp) || return 1
  if ! curl -fsSL "$url" -o "$tmp"; then
    rm -f "$tmp"
    echo "could not download $url" >&2
    return 1
  fi
  # shellcheck disable=SC2086  # $envs is intentionally split into VAR=value words
  env $envs "$interp" "$tmp" "$@"
  rc=$?
  rm -f "$tmp"
  return "$rc"
}

# usage: fetch_run LABEL "VAR=1 VAR2=x" INTERPRETER URL [args...]   (env may be "")
fetch_run() {
  local label=$1 envs=$2 interp=$3 url=$4
  shift 4
  if [ "$DRY_RUN" = 1 ]; then
    dry "download $url and run: ${envs:+$envs }$interp $*"
    return 0
  fi
  spin "$label" _fetch_and_run "$envs" "$interp" "$url" "$@"
}

# Non-comment, non-blank lines of a list file.
list_items() { grep -v '^[[:space:]]*\(#\|$\)' "$1" 2>/dev/null; }

count_entries() { grep -cE '^(tap|brew|cask|mas|vscode|go|uv|cargo|npm) ' "$1" 2>/dev/null; }

detect_os() {
  case "$(uname -s)" in
    Darwin) OS=mac ;;
    Linux)
      if [ -r "$OS_RELEASE_FILE" ] && grep -qiE '^ID(_LIKE)?=.*(ubuntu|debian)' "$OS_RELEASE_FILE"; then
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

# Ask for sudo up front, in the foreground, and keep the ticket alive: a password
# prompt behind a spinner would look like a hang.
need_sudo() {
  [ "$DRY_RUN" = 1 ] && return 0
  if ! sudo -n true 2>/dev/null; then
    info "sudo password needed"
    sudo -v || die "could not get sudo"
  fi
  if [ -z "$SUDO_KEEPALIVE_PID" ]; then
    (
      while :; do
        sudo -n -v 2>/dev/null
        sleep 50
        kill -0 "$$" 2>/dev/null || exit 0
      done
    ) >/dev/null 2>&1 &
    SUDO_KEEPALIVE_PID=$!
  fi
}

# Do not leave a root-capable ticket available to downloaded installers or
# package lifecycle scripts. Privileged Linux setup reacquires it when needed.
release_sudo() {
  [ "$DRY_RUN" = 1 ] && return 0
  if [ -n "$SUDO_KEEPALIVE_PID" ]; then
    kill "$SUDO_KEEPALIVE_PID" 2>/dev/null
    SUDO_KEEPALIVE_PID=""
  fi
  sudo -k 2>/dev/null || true
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
  local pkgs missing p rc=0
  if [ "$OS" = mac ]; then
    if ! xcode-select -p >/dev/null 2>&1; then
      if [ "$DRY_RUN" = 1 ]; then
        dry "xcode-select --install, then stop until it finishes"
      else
        xcode-select --install >/dev/null 2>&1
        die "finish the Xcode Command Line Tools installer that just opened, then re-run this script"
      fi
    else
      info "Xcode command line tools present"
    fi
  else
    pkgs=$(list_items "$BOOT_DIR/apt.txt" | tr '\n' ' ')
    missing=""
    for p in $pkgs; do
      if ! dpkg -s "$p" 2>/dev/null | grep -q '^Status: install ok installed'; then
        missing="$missing $p"
      fi
    done
    if [ -n "$missing" ]; then
      need_sudo
      run_as "apt-get update" sudo apt-get update || rc=1
      # shellcheck disable=SC2086  # $missing is a list of package names
      if [ "$rc" = 0 ]; then
        run_as "apt-get install$missing" sudo env DEBIAN_FRONTEND=noninteractive apt-get install -y $missing || rc=1
      fi
    else
      info "apt prerequisites already installed"
    fi
  fi
  if [ "$rc" != 0 ]; then
    release_sudo
    return 1
  fi

  if brew_bin >/dev/null 2>&1; then
    info "Homebrew already installed"
  else
    need_sudo
    fetch_run "install Homebrew" "NONINTERACTIVE=1" bash "https://raw.githubusercontent.com/Homebrew/install/$HOMEBREW_INSTALL_COMMIT/install.sh" || rc=1
  fi
  if [ "$DRY_RUN" != 1 ] && [ "$rc" = 0 ]; then
    load_brew_env || rc=1
  fi
  release_sudo
  [ "$rc" = 0 ] || { warn "Homebrew is not usable after the install"; return 1; }
}

step_brew() {
  local f rc=0 out plan errors check_rc upflag="--no-upgrade" verb="install"
  if [ "$UPGRADE" = 1 ]; then
    upflag=""
    verb="install or upgrade"
  fi
  if ! load_brew_env 2>/dev/null; then
    if [ "$DRY_RUN" = 1 ]; then
      dry "brew bundle (Homebrew is not installed yet)"
      return 0
    fi
    warn "Homebrew not found"
    return 1
  fi
  for f in Brewfile Brewfile.mac; do
    [ "$f" = Brewfile.mac ] && [ "$OS" != mac ] && continue
    if [ "$DRY_RUN" = 1 ]; then
      info "checking $f ..."
      # No auto-update: a dry run must not touch Homebrew's own index either.
      # shellcheck disable=SC2086  # $upflag is empty or one option
      out=$(HOMEBREW_NO_AUTO_UPDATE=1 HOMEBREW_NO_ENV_HINTS=1 brew bundle check $upflag --verbose --file "$BOOT_DIR/$f" 2>&1)
      check_rc=$?
      plan=$(printf '%s\n' "$out" | sed -n 's/^→ /        /p')
      errors=$(printf '%s\n' "$out" | grep -vE '^→ .*|^[[:space:]]*$')
      if [ "$check_rc" != 0 ] && { [ -z "$plan" ] || [ -n "$errors" ]; }; then
        warn "$f: brew bundle check failed"
        printf '%s\n' "$out" | sed 's/^/        /' >&2
        return 1
      elif [ -n "$plan" ]; then
        dry "$f: brew would $verb:"
        printf '%s\n' "$plan"
      else
        dry "$f: nothing to $verb"
      fi
    elif [ "$UPGRADE" = 1 ]; then
      spin_progress "$(count_entries "$BOOT_DIR/$f")" "$BREW_PROGRESS_REGEX" "brew bundle $f" brew bundle --file "$BOOT_DIR/$f" || rc=1
    else
      spin_progress "$(count_entries "$BOOT_DIR/$f")" "$BREW_PROGRESS_REGEX" "brew bundle $f" brew bundle --no-upgrade --file "$BOOT_DIR/$f" || rc=1
    fi
  done
  if [ "$rc" != 0 ]; then
    warn "some Brewfile entries failed. On a Mac, App Store apps (mas) need you to sign in to the App Store first. Fix and re-run."
  fi
  return "$rc"
}

step_toolchains() {
  local rc=0 pkg

  # bun and pnpm append to ~/.zshrc, which is stowed from the repo, so this step
  # has to run before stow. Whatever they add lands in a file stow will back up.
  if have bun || [ -x "$HOME/.bun/bin/bun" ]; then
    info "bun already installed"
  else
    fetch_run "install bun" "" bash https://bun.sh/install || rc=1
  fi

  if have pnpm || [ -x "$(pnpm_home_dir)/pnpm" ]; then
    info "pnpm already installed"
  else
    fetch_run "install pnpm" "" sh https://get.pnpm.io/install.sh || rc=1
  fi

  # nvm: PROFILE=/dev/null stops its installer appending to ~/.zshrc.
  if [ -s "$NVM_DIR/nvm.sh" ]; then
    info "nvm already installed"
  else
    fetch_run "install nvm $NVM_VERSION" "PROFILE=/dev/null" bash "https://raw.githubusercontent.com/nvm-sh/nvm/$NVM_VERSION/install.sh" || rc=1
  fi
  # default-packages must be linked AFTER the installer: it git-clones into ~/.nvm
  # and fails if that directory already exists. nvm installs everything listed in
  # it after every `nvm install`, which is how npm.txt gets applied.
  if [ -d "$NVM_DIR" ] || [ "$DRY_RUN" = 1 ]; then
    quiet ln -sfn "$BOOT_DIR/npm.txt" "$NVM_DIR/default-packages" || rc=1
  fi
  if [ "$DRY_RUN" != 1 ] && [ -s "$NVM_DIR/nvm.sh" ]; then
    # shellcheck source=/dev/null
    . "$NVM_DIR/nvm.sh"
    if [ "$(nvm version 'lts/*' 2>/dev/null)" = "N/A" ]; then
      spin "nvm install --lts (and npm.txt)" nvm install --lts || rc=1
    else
      info "an LTS node is already installed"
    fi
    nvm alias default 'lts/*' >/dev/null 2>&1 || true
    # spin runs in a subshell, so nvm install's PATH change does not reach us.
    # Select nvm's Node here before globals/inits (brew may also provide Node).
    if nvm use --silent default; then
      # default-packages runs only during nvm install. Also fill gaps on existing
      # LTS installations and retries after a failed global package install.
      for pkg in $(list_items "$BOOT_DIR/npm.txt"); do
        if npm ls -g --depth=0 "$pkg" >/dev/null 2>&1; then
          info "npm: $pkg already installed"
        else
          run_as "npm install -g $pkg" npm install -g "$pkg" || rc=1
        fi
      done
    else
      warn "nvm's default Node is not usable"
      rc=1
    fi
  elif [ "$DRY_RUN" = 1 ]; then
    dry "nvm install --lts (if no LTS node is installed), then nvm alias default 'lts/*'"
    dry "nvm use default, then install any missing packages from npm.txt"
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
    fetch_run "install Claude Code" "" bash https://claude.ai/install.sh || rc=1
  fi
  if have opencode || [ -x "$HOME/.opencode/bin/opencode" ]; then
    info "opencode already installed"
  else
    fetch_run "install opencode" "" bash https://opencode.ai/install --no-modify-path || rc=1
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
        run_as "bun add -g $pkg" bun add -g "$pkg" || { warn "bun add -g $pkg failed"; rc=1; }
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
        run_as "pnpm add -g $pkg" pnpm add -g "$pkg" || { warn "pnpm add -g $pkg failed"; rc=1; }
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
    run_as "clone oh-my-zsh" git clone --depth=1 https://github.com/ohmyzsh/ohmyzsh.git "$zdir" || return 1
  fi
  while read -r name url; do
    [ -n "$name" ] || continue
    dest="$zdir/custom/plugins/$name"
    if [ -d "$dest" ]; then
      info "omz plugin $name already installed"
    else
      run_as "clone plugin $name" git clone --depth=1 "$url" "$dest" || { warn "could not clone $name"; rc=1; }
    fi
  done < <(list_items "$BOOT_DIR/omz-plugins.txt")
  return "$rc"
}

stow_run() {
  # $1 = simulate | real. Output and status are the caller's to inspect.
  # Both packages contain .config. During simulation Stow cannot unfold a
  # directory link it has only planned (fresh HOME). Walk the individual files
  # instead; keep both packages in one plan so cross-package conflicts are caught.
  (
    cd "$DOTFILES_DIR" || exit 1
    export LC_ALL=C
    if [ "$1" = simulate ]; then
      stow --simulate --no-folding -t "$HOME" "${STOW_IGNORES[@]}" . AI
    else
      stow -t "$HOME" "${STOW_IGNORES[@]}" . || exit 1
      # Also unfolds an opencode directory linked by a previous manual stow.
      # mkdir -p alone follows that symlink, letting init tools write into git.
      stow --restow --no-folding -t "$HOME" "${STOW_IGNORES[@]}" AI
    fi
  ) 2>&1
}

# Move every real file that is in stow's way to $BACKUP_DIR (same relative path).
# Never --adopt: that would pull the machine's file into the repo.
resolve_conflicts() {
  local round=0 out paths p rc other
  while [ "$round" -lt 6 ]; do
    out=$(stow_run simulate)
    rc=$?
    # Homebrew Stow 2.4 and Ubuntu's Stow 2.3 describe file conflicts differently.
    # A shared parent (e.g. .config) may be reported once by each package.
    paths=$(printf '%s\n' "$out" | sed -n \
      -e 's/^  \* cannot stow .* over existing target \(.*\) since neither a link nor a directory.*$/\1/p' \
      -e 's/^  \* existing target is neither a link nor a directory: \(.*\)$/\1/p' | sort -u)
    other=$(printf '%s\n' "$out" | grep -E '^(  \*|stow: ERROR)' | grep -vE \
      '^  \* (cannot stow .* over existing target .* since neither a link nor a directory|existing target is neither a link nor a directory: )')
    if [ -n "$other" ]; then
      printf '%s\n' "$out" | sed 's/^/      /' >&2
      return 1
    fi
    if [ -z "$paths" ]; then
      if [ "$rc" != 0 ]; then
        printf '%s\n' "$out" | sed 's/^/      /' >&2
        return 1
      fi
      return 0
    fi
    while IFS= read -r p; do
      [ -n "$p" ] || continue
      if [ "$DRY_RUN" = 1 ]; then
        dry "move ~/$p to $BACKUP_DIR/$p"
      else
        mkdir -p "$(dirname "$BACKUP_DIR/$p")" && mv "$HOME/$p" "$BACKUP_DIR/$p" || return 1
        BACKED_UP=1
        info "backed up ~/$p"
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
      dry "stow is not installed yet, so the link plan can't be simulated"
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
  # Resolve blockers, including ~/.config itself being a conflicting file.
  resolve_conflicts || return 1
  # Keep .config real before linking the shared packages. Only tracked files in
  # opencode are linked; init tools can create plugins/skills outside the repo.
  quiet mkdir -p "$HOME/.config" "$HOME/.config/opencode" || return 1
  if [ "$DRY_RUN" = 1 ]; then
    dry "stow simulation reports no other problems"
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
    quiet sudo ln -s /home/linuxbrew/.linuxbrew /opt/homebrew || { release_sudo; return 1; }
  fi
  # UNTESTED: the same block sources this iTerm file unguarded.
  if [ ! -e "$HOME/.iterm2_shell_integration.zsh" ]; then
    quiet touch "$HOME/.iterm2_shell_integration.zsh" || { release_sudo; return 1; }
  fi
  release_sudo
}

step_inits() {
  local rc=0
  quiet mkdir -p "$HOME/.claude"    # rtk init exits 1 without it

  if have rtk; then
    if [ -f "$HOME/.claude/RTK.md" ] && [ -f "$HOME/.config/opencode/plugins/rtk.ts" ]; then
      info "rtk already initialised"
    else
      run_as "rtk init" rtk init --global --opencode --auto-patch || rc=1
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
      run_as "icm init" icm init || rc=1
    fi
  else
    warn "icm is not installed"
    [ "$DRY_RUN" = 1 ] || rc=1
  fi

  # No-op once .zshrc is stowed (it already has the integration line).
  if have wt; then
    run_as "worktrunk shell integration" wt config shell install zsh || rc=1
  fi
  if have awesome-lazy-zsh; then
    info "awesome-lazy-zsh --doctor: $(awesome-lazy-zsh --doctor 2>&1 | tr '\n' ' ')"
  fi
  return "$rc"
}

step_finish() {
  local login_shell zsh_bin rc=0
  zsh_bin=$(command -v zsh 2>/dev/null)
  if [ "$OS" = linux ] && [ -n "$zsh_bin" ] && [ -x "$zsh_bin" ]; then
    login_shell=$(getent passwd "$(id -un)" 2>/dev/null | cut -d: -f7)
    if [ -z "$login_shell" ]; then
      warn "could not determine the login shell"
      rc=1
    elif [ "$(basename "$login_shell")" != zsh ]; then
      need_sudo
      run_as "make zsh the login shell" sudo chsh -s "$zsh_bin" "$(id -un)" || { warn "chsh failed; set your login shell to zsh by hand"; rc=1; }
      release_sudo
    fi
  fi
  if [ -n "$(git -C "$DOTFILES_DIR" status --porcelain 2>/dev/null)" ]; then
    warn "the repo has uncommitted changes. Fine if you are editing it; otherwise an installer edited a stowed file. Check: git -C $DOTFILES_DIR diff"
  fi
  return "$rc"
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

# --------------------------------------------------------------------- demo ---

demo_progress() {
  local i=1
  while [ "$i" -le 40 ]; do
    printf 'Installing package-%02d\n' "$i"
    i=$((i + 1))
    sleep 0.07
  done
}

demo_fail() {
  printf 'resolving mirror...\n'
  sleep 0.6
  printf 'curl: (22) The requested URL returned error: 404\n' >&2
  sleep 0.3
  return 3
}

# The whole display with fake tasks, so it can be previewed without installing anything.
run_demo() {
  OS=mac
  DRY_RUN=1
  RUN_START=$SECONDS
  print_banner
  DRY_RUN=0
  step_header prerequisites 2 11
  info "Homebrew already installed"
  spin "apt-get update" sleep 1.2
  spin "install Homebrew" sleep 1.5
  step_header brew 3 11
  spin_progress 40 '^Installing ' "brew bundle Brewfile" demo_progress
  step_header toolchains 4 11
  spin "install bun" sleep 1
  warn "example warning: pnpm was skipped"
  spin "install nvm $NVM_VERSION" demo_fail
  step_header stow 8 11
  info "backed up ~/.zshrc"
  info "stowed into $HOME"
  record "done" preflight 0
  record "done" prerequisites 3
  record "done" brew 4
  record failed toolchains 2
  record skipped agents 0
  record "done" stow 1
  print_summary
  print_next_steps
}

# ------------------------------------------------------------------- main ---

main() {
  local s known ok t0 idx=0 total=0 failed=0 stow_failed=0
  while [ $# -gt 0 ]; do
    case "$1" in
      --dry-run)       DRY_RUN=1 ;;
      --upgrade)       UPGRADE=1 ;;
      --check-cleanup) CHECK_CLEANUP=1 ;;
      --plain)         PLAIN=1 ;;
      --demo)          DEMO=1 ;;
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

  init_ui
  trap cleanup_ui EXIT
  trap on_interrupt INT TERM

  if [ "$CHECK_CLEANUP" = 1 ]; then
    check_cleanup
    exit 0
  fi
  if [ "$DEMO" = 1 ]; then
    run_demo
    exit 0
  fi

  if [ "$DRY_RUN" != 1 ] && mkdir -p "$LOG_DIR" 2>/dev/null; then
    LOG_FILE="$LOG_DIR/$(date +%Y%m%d-%H%M%S).log"
  fi
  detect_os
  prepare_env
  RUN_START=$SECONDS
  print_banner

  for s in $STEPS; do total=$((total + 1)); done
  for s in $STEPS; do
    idx=$((idx + 1))
    step_header "$s" "$idx" "$total"
    case "$SKIP" in
      *" $s "*)
        info "skipped (--skip)"
        record skipped "$s" 0
        continue
        ;;
    esac
    if [ "$stow_failed" = 1 ] && { [ "$s" = inits ] || [ "$s" = finish ]; }; then
      info "skipped (stow failed)"
      record skipped "$s" 0
      continue
    fi
    t0=$SECONDS
    ok=1
    "step_$s" || ok=0
    if [ "$ok" = 1 ]; then
      record "done" "$s" $((SECONDS - t0))
    else
      record failed "$s" $((SECONDS - t0))
      failed=1
      if [ "$s" = stow ]; then stow_failed=1; fi
    fi
  done

  print_summary
  if [ "$failed" = 1 ]; then
    printf '\n  %s%s some steps failed.%s Read the messages above, fix them and re-run: finished steps are skipped.\n' "$C_RED" "$FAIL" "$C_RESET"
  fi
  print_next_steps
  exit "$failed"
}

main "$@"
