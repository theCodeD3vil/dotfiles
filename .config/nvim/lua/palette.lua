-- Vira Deepforest: the one place nvim spells these hexes out. The names are
-- kept from the old Catppuccin palette so the themes and highlights that
-- require this file need no edits; several names share one Deepforest color
-- because Deepforest has fewer hues. Colors are the ANSI slots of
-- vira-theme-for-terminals/ghostty/Vira-Theme-Deepforest.conf plus its accent.
-- Deepforest has no pink: `pink` is an even blend of its red and purple, and
-- `flamingo` is that pink blended half and half with the text color. `mauve`
-- (the "dark_purple" in the Vira themes) is also that pink, so the editor shows
-- no purple.
-- tmux keeps its own copy in tmux/conf/theme.conf, gitmux in .gitmux.conf,
-- starship in starship.toml (none of them can require a Lua module).

return {
  flamingo = "#CBB2BC",
  pink = "#CB7FA3",
  mauve = "#CB7FA3",
  red = "#f07178",
  maroon = "#CC8868",
  peach = "#CC8868",
  yellow = "#FFCB6B",
  green = "#C3E88D",
  teal = "#80CBC4",
  sky = "#74C9DE",
  sapphire = "#74C9DE",
  blue = "#6FA0DE",
  lavender = "#95BBBD",
}
