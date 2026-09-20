-- Vira Deepforest: bg/fg surface ramp from vira-theme-for-terminals/
-- ghostty/Vira-Deepforest.conf; decoration colors
-- (red/green/blue/etc) are literal Catppuccin Mocha, from lua/palette.lua.

local p = require("palette")

local M = {}

M.base_30 = {
  white = "#CAE5D5",
  darker_black = "#080c0b",
  black = "#111816",
  black2 = "#17201e",
  one_bg = "#1b2623",
  one_bg2 = "#212f2b",
  one_bg3 = "#283834",
  grey = "#515f58",
  grey_fg = "#64746b",
  grey_fg2 = "#76887f",
  light_grey = "#76887f",
  red = p.red,
  baby_pink = p.flamingo,
  pink = p.pink,
  line = "#283834",
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
  cyan = p.teal,
  statusline_bg = "#080c0b",
  lightbg = "#212f2b",
  pmenu_bg = p.blue,
  folder_bg = p.blue,
}

M.base_16 = {
  base00 = "#111816",
  base01 = "#1b2623",
  base02 = "#212f2b",
  base03 = "#64746b",
  base04 = "#76887f",
  base05 = "#CAE5D5",
  base06 = "#76887f",
  base07 = "#ecf5f0",
  base08 = p.red,
  base09 = p.peach,
  base0A = p.yellow,
  base0B = p.green,
  base0C = p.teal,
  base0D = p.blue,
  base0E = p.lavender,
  base0F = p.maroon,
}

M.type = "dark"

M = require("base46").override_theme(M, "vira_deepforest")

return M
