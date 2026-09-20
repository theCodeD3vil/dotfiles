-- Vira Graphene: bg/fg surface ramp from vira-theme-for-terminals/
-- ghostty/Vira-Graphene.conf; decoration colors
-- (red/green/blue/etc) are literal Catppuccin Mocha, from lua/palette.lua.

local p = require("palette")

local M = {}

M.base_30 = {
  white = "#D9D9D9",
  darker_black = "#161616",
  black = "#212121",
  black2 = "#282828",
  one_bg = "#2d2d2d",
  one_bg2 = "#353535",
  one_bg3 = "#3d3d3d",
  grey = "#616161",
  grey_fg = "#737373",
  grey_fg2 = "#868686",
  light_grey = "#868686",
  red = p.red,
  baby_pink = p.flamingo,
  pink = p.pink,
  line = "#3d3d3d",
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
  statusline_bg = "#161616",
  lightbg = "#353535",
  pmenu_bg = p.blue,
  folder_bg = p.blue,
}

M.base_16 = {
  base00 = "#212121",
  base01 = "#2d2d2d",
  base02 = "#353535",
  base03 = "#737373",
  base04 = "#868686",
  base05 = "#D9D9D9",
  base06 = "#868686",
  base07 = "#f2f2f2",
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

M = require("base46").override_theme(M, "vira_graphene")

return M
