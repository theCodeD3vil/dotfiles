-- Vira Ocean: bg/fg surface ramp from vira-theme-for-terminals/
-- ghostty/Vira-Ocean.conf; decoration colors
-- (red/green/blue/etc) are literal Catppuccin Mocha, from lua/palette.lua.

local p = require("palette")

local M = {}

M.base_30 = {
  white = "#CED1E3",
  darker_black = "#07080d",
  black = "#0F111A",
  black2 = "#141723",
  one_bg = "#181b2a",
  one_bg2 = "#1d2133",
  one_bg3 = "#23283d",
  grey = "#515460",
  grey_fg = "#646774",
  grey_fg2 = "#787a88",
  light_grey = "#787a88",
  red = p.red,
  baby_pink = p.flamingo,
  pink = p.pink,
  line = "#23283d",
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
  statusline_bg = "#07080d",
  lightbg = "#1d2133",
  pmenu_bg = p.blue,
  folder_bg = p.blue,
}

M.base_16 = {
  base00 = "#0F111A",
  base01 = "#181b2a",
  base02 = "#1d2133",
  base03 = "#646774",
  base04 = "#787a88",
  base05 = "#CED1E3",
  base06 = "#787a88",
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

M = require("base46").override_theme(M, "vira_ocean")

return M
