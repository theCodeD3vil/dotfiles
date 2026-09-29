#!/usr/bin/env bash
# Claude Code statusLine — "tmux Pills": split left (model, context) vs
# right (usage: 5h, 7d), justified across the full terminal width
# the same way tmux's status-left/status-right split works.
# Model is icon-in-a-pill (tmux's own SESSION/GIT/DIRECTORY_PILL cap
# style: a left round-cap glyph, flat cut back to default, no closing
# glyph) + plain text. Context/5H/7D are plain-text label + a font-drawn
# progress meter (vibe-island glyphs, PUA U+EE00-EE05) — no pill, no
# bg-color cells; the font draws the meter's own rounding.
# Regenerate/edit only via the "statusline-setup" agent.

export LANG="${LANG:-en_US.UTF-8}"
input="$(cat)"

model="$(printf '%s' "$input" | jq -r '.model.display_name // empty')"

# ---- Catppuccin Mocha truecolor palette (matches tmux/conf/theme.conf) ----
FG0=$'\033[38;2;17;17;27m'          # crust     #11111b — icon ink on accent fill
TEXT=$'\033[38;2;205;214;244m'      # text      #cdd6f4 — plain label ink
FG_TRACK=$'\033[38;2;69;71;90m'    # surface_1 #45475a — empty-glyph tint on the progress meters
RESET=$'\033[0m'
CAPL=""   # powerline left round cap  — matches tmux's SESSION/GIT/DIRECTORY_PILL

FG_CLAUDE=$'\033[38;2;204;120;92m';    BG_CLAUDE=$'\033[48;2;204;120;92m'  # #CC785C, Claude's brand orange
# Severity colors below are darkened ~20% from Catppuccin Mocha's own
# green/yellow/peach/red — the bar fill is the only place white text (#cdd6f4)
# sits directly on top of these, and Mocha's pastels are too light for that
# to contrast well. Darkened here only; every other pill keeps true Mocha.
FG_GREEN=$'\033[38;2;133;182;129m';    BG_GREEN=$'\033[48;2;133;182;129m'
FG_YELLOW=$'\033[38;2;199;181;140m';   BG_YELLOW=$'\033[48;2;199;181;140m'
FG_ORANGE=$'\033[38;2;200;143;108m';   BG_ORANGE=$'\033[48;2;200;143;108m'
FG_RED=$'\033[38;2;194;111;134m';      BG_RED=$'\033[48;2;194;111;134m'

# ---- Icon pill: only the icon sits in a colored pill — rounded on the
#      left, flat/square on the right (same as tmux's own SESSION/GIT/
#      DIRECTORY_PILL: a left cap glyph, then a flat cut back to default,
#      no closing glyph). The label that follows is plain text. ----
icon_pill() {
  local fg="$1" bg="$2" icon="$3"
  printf '%s' "${fg}${CAPL}${RESET}${FG0}${bg} ${icon} ${RESET}"
}

# ---- Usage severity: green <50%, yellow 50-74%, orange 75-84%, red >=85% ----
sev_fg() { local p="$1"; if [ "$p" -ge 85 ]; then printf '%s' "$FG_RED"; elif [ "$p" -ge 75 ]; then printf '%s' "$FG_ORANGE"; elif [ "$p" -ge 50 ]; then printf '%s' "$FG_YELLOW"; else printf '%s' "$FG_GREEN"; fi; }

# ---- Progress meter: font-drawn pill (vibe-island glyphs, PUA
#      U+EE00-EE05), shared by ctx / 5h / 7d. Each of the pill's 3
#      positions (left cap / mid / right cap) has its own empty/full
#      glyph, so the font itself draws the rounding and the fill
#      boundary; we just pick empty vs full per cell and tint it
#      (foreground only, no cell bg) with severity color for filled
#      cells, track color for empty ones. ----
GLYPH_EMPTY_L=""; GLYPH_EMPTY_M=""; GLYPH_EMPTY_R=""
GLYPH_FULL_L="";  GLYPH_FULL_M="";  GLYPH_FULL_R=""

draw_glyph_bar_pct() {
  local pct="$1" width="$2"
  local filled=$(( pct * width / 100 ))
  [ "$filled" -lt 0 ] && filled=0
  [ "$filled" -gt "$width" ] && filled="$width"
  [ "$pct" -gt 0 ] && [ "$filled" -eq 0 ] && filled=1
  local full_fg; full_fg="$(sev_fg "$pct")"
  local bar="" i shape fg glyph
  for ((i = 0; i < width; i++)); do
    if [ "$i" -eq 0 ]; then
      shape=L
    elif [ "$i" -eq $((width - 1)) ]; then
      shape=R
    else
      shape=M
    fi
    if [ "$i" -lt "$filled" ]; then
      fg="$full_fg"
      case "$shape" in
        L) glyph="$GLYPH_FULL_L" ;;
        R) glyph="$GLYPH_FULL_R" ;;
        *) glyph="$GLYPH_FULL_M" ;;
      esac
    else
      fg="$FG_TRACK"
      case "$shape" in
        L) glyph="$GLYPH_EMPTY_L" ;;
        R) glyph="$GLYPH_EMPTY_R" ;;
        *) glyph="$GLYPH_EMPTY_M" ;;
      esac
    fi
    bar="${bar}${fg}${glyph}"
  done
  printf '%s' "${bar}${RESET}"
}

CTX_BAR_WIDTH=14
USAGE_BAR_WIDTH=10

# ---- Usage percentages, straight from the statusLine JSON ----
ctx_pct="$(printf '%s' "$input" | jq -r '.context_window.used_percentage | if . == null then empty else (round|tostring) end' 2>/dev/null)"
five_pct="$(printf '%s' "$input" | jq -r '.rate_limits.five_hour.used_percentage | if . == null then empty else (round|tostring) end' 2>/dev/null)"
seven_pct="$(printf '%s' "$input" | jq -r '.rate_limits.seven_day.used_percentage | if . == null then empty else (round|tostring) end' 2>/dev/null)"

# ---- Left group: model (icon in a colored pill) + context meter
#      (plain icon + progress pill, no color pill around it) ----
left=""
if [ -n "$model" ]; then
  left="$(icon_pill "$FG_CLAUDE" "$BG_CLAUDE" "") ${TEXT}${model}"
fi
if [ -n "$ctx_pct" ]; then
  [ -n "$left" ] && left="${left}  "
  left="${left}${TEXT}󰧑 ${RESET}$(draw_glyph_bar_pct "$ctx_pct" "$CTX_BAR_WIDTH")"
fi

# ---- Right group: usage ----
right=""
if [ -n "$five_pct" ]; then
  right="${TEXT} ${RESET}$(draw_glyph_bar_pct "$five_pct" "$USAGE_BAR_WIDTH")"
fi
if [ -n "$seven_pct" ]; then
  [ -n "$right" ] && right="${right}  "
  right="${right}${TEXT} ${RESET}$(draw_glyph_bar_pct "$seven_pct" "$USAGE_BAR_WIDTH")"
fi
# ---- Justify left/right across the real terminal width, like tmux's
#      status-left/status-right split. tput reaches the controlling
#      terminal directly, so this works even though statusLine's own
#      stdout isn't a tty. ----
cols="$(tput cols 2>/dev/null)"
[ -n "$cols" ] || cols="${COLUMNS:-80}"

strip_len() {
  local plain
  plain="$(printf '%s' "$1" | sed -E $'s/\033\\[[0-9;]*m//g')"
  printf '%s' "${#plain}"
}

left_len="$(strip_len "$left")"
right_len="$(strip_len "$right")"
# Margin of 8, carried over from when 5H/7D used CAPL/CAPR pill caps:
# live debug capture (cols=157, tput and COLUMNS agreeing) confirmed
# cols itself is measured correctly, so this margin covers PUA glyph
# width risk, not an unknown terminal width. 5H/7D now use the
# draw_glyph_bar_pct meter (10 EE0x glyphs each) instead of CAPL/CAPR,
# a different glyph set with unverified wcwidth behavior — re-check
# against a live render if the right edge drifts again.
pad=$(( cols - left_len - right_len - 8 ))
[ "$pad" -lt 2 ] && pad=2

if [ -n "$right" ]; then
  printf '%s%*s%s' "$left" "$pad" '' "$right"
else
  printf '%s' "$left"
fi
