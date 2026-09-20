-- Vira Teal: bg/fg surface ramp from vira-theme-for-terminals/
-- ghostty/Vira-Teal.conf; decoration colors
-- (red/green/blue/etc) are literal Catppuccin Mocha, from lua/palette.lua.

local p = require("palette")

local M = {}

M.base_30 = {
  white = "#D8DFDF",
  darker_black = "#1d272b",
  black = "#263238",
  black2 = "#2c3a41",
  one_bg = "#303f47",
  one_bg2 = "#364750",
  one_bg3 = "#3c4f59",
  grey = "#646e72",
  grey_fg = "#767f83",
  grey_fg2 = "#879193",
  light_grey = "#879193",
  red = p.red,
  baby_pink = p.flamingo,
  pink = p.pink,
  line = "#3c4f59",
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
  statusline_bg = "#1d272b",
  lightbg = "#364750",
  pmenu_bg = p.blue,
  folder_bg = p.blue,
}

M.base_16 = {
  base00 = "#263238",
  base01 = "#303f47",
  base02 = "#364750",
  base03 = "#767f83",
  base04 = "#879193",
  base05 = "#D8DFDF",
  base06 = "#879193",
  base07 = "#f4f5f5",
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

M = require("base46").override_theme(M, "vira_teal")

return M
