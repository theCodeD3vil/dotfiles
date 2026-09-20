-- Vira Palenight: bg/fg surface ramp from vira-theme-for-terminals/
-- ghostty/Vira-Palenight.conf; decoration colors
-- (red/green/blue/etc) are literal Catppuccin Mocha, from lua/palette.lua.

local p = require("palette")

local M = {}

M.base_30 = {
  white = "#CED1E3",
  darker_black = "#202431",
  black = "#292D3E",
  black2 = "#2f3347",
  one_bg = "#33384d",
  one_bg2 = "#393e56",
  one_bg3 = "#3f455f",
  grey = "#626677",
  grey_fg = "#737688",
  grey_fg2 = "#838798",
  light_grey = "#838798",
  red = p.red,
  baby_pink = p.flamingo,
  pink = p.pink,
  line = "#3f455f",
  green = p.green,
  vibrant_green = p.green,
  nord_blue = p.sapphire,
  blue = p.blue,
  yellow = p.yellow,
  sun = p.peach,
  purple = p.lavender,
  dark_purple = p.mauve,
  teal = p.teal,
  orange = p.peach,
  cyan = p.sky,
  statusline_bg = "#202431",
  lightbg = "#393e56",
  pmenu_bg = p.blue,
  folder_bg = p.blue,
}

M.base_16 = {
  base00 = "#292D3E",
  base01 = "#33384d",
  base02 = "#393e56",
  base03 = "#737688",
  base04 = "#838798",
  base05 = "#CED1E3",
  base06 = "#838798",
  base07 = "#eeeff5",
  base08 = p.red,
  base09 = p.peach,
  base0A = p.yellow,
  base0B = p.green,
  base0C = p.sky,
  base0D = p.blue,
  base0E = p.lavender,
  base0F = p.maroon,
}

M.type = "dark"

M = require("base46").override_theme(M, "vira_palenight")

return M
