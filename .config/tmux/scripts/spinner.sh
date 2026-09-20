#!/bin/bash
# Busy spinner for tmux windows. Started once per server from conf/windows.conf.
#
# A background window counts as busy while it printed output in the last BUSY_SECS
# seconds (downloads, builds, agents redrawing their own spinner). Busy windows get
# the window option @busy=1, and the global @spin holds the current spinner frame;
# windows.conf shows @spin in place of the window index. The active window is never
# marked: your own typing counts as output, and you can see what it's doing anyway.
#
# One ticker per tmux server (guarded by @spinner_pid). It exits when the server does.
# Setting an option redraws the status line without forcing `#()` jobs to re-run
# (refresh-client -S would re-run gitmux on every frame), and nothing is set while idle.

BUSY_SECS=3
FAST=0.04   # sleep between frames while busy; with ~40 ms of work per tick that is ~80 ms/frame (12 fps), the usual spinner speed
SLOW=1      # seconds between checks while idle
FRAMES=(⠋ ⠙ ⠹ ⠸ ⠼ ⠴ ⠦ ⠧ ⠇ ⠏)

old=$(tmux show -gv @spinner_pid 2>/dev/null)
if [ -n "$old" ] && [ "$old" != "$$" ] && kill -0 "$old" 2>/dev/null; then
  exit 0
fi
tmux set -g @spinner_pid "$$" || exit 0

prev=" "   # ids of the windows currently marked busy, each surrounded by spaces
frame=0
while :; do
  windows=$(tmux list-windows -a -F '#{window_id} #{window_active} #{window_activity}' 2>/dev/null) || exit 0
  all=" $(printf '%s\n' "$windows" | awk '{ printf "%s ", $1 }')"
  cur=" $(printf '%s\n' "$windows" | awk -v now="$(date +%s)" -v t="$BUSY_SECS" '$2 == 0 && now - $3 < t { printf "%s ", $1 }')"

  args=()
  for id in $cur; do
    case "$prev" in *" $id "*) ;; *) args+=(set -w -t "$id" @busy 1 ';') ;; esac
  done
  for id in $prev; do
    # a window that closed can't be unset (and the error would abort the rest of the batch)
    case "$cur" in *" $id "*) continue ;; esac
    case "$all" in *" $id "*) args+=(set -wu -t "$id" @busy ';') ;; esac
  done

  if [ "$cur" != " " ]; then
    frame=$(( (frame + 1) % ${#FRAMES[@]} ))
    args+=(set -g @spin "${FRAMES[$frame]}" ';')
    delay=$FAST
  else
    delay=$SLOW
  fi

  if [ ${#args[@]} -gt 0 ]; then
    tmux "${args[@]}" 2>/dev/null
  fi
  prev=$cur
  sleep "$delay"
done
