-- Vira Carbon: bg/fg surface ramp from vira-theme-for-terminals/
-- ghostty/Vira-Carbon.conf; decoration colors
-- (red/green/blue/etc) are literal Catppuccin Mocha, from lua/palette.lua.

local p = require("palette")

local M = {}

M.base_30 = {
  white = "#D9D9D9",
  darker_black = "#000000",
  black = "#0A0A0A",
  black2 = "#111111",
  one_bg = "#161616",
  one_bg2 = "#1e1e1e",
  one_bg3 = "#262626",
  grey = "#525252",
  grey_fg = "#676767",
  grey_fg2 = "#7b7b7b",
  light_grey = "#7b7b7b",
  red = p.red,
  baby_pink = p.flamingo,
  pink = p.pink,
  line = "#262626",
  green = p.green,
  vibrant_green = p.green,
  nord_blue = p.sky,
  blue = p.sapphire,
  yellow = p.yellow,
  sun = p.peach,
  purple = p.lavender,
  dark_purple = p.mauve,
  teal = p.teal,
  orange = p.peach,
  cyan = p.teal,
  statusline_bg = "#000000",
  lightbg = "#1e1e1e",
  pmenu_bg = p.sapphire,
  folder_bg = p.sapphire,
}

M.base_16 = {
  base00 = "#0A0A0A",
  base01 = "#161616",
  base02 = "#1e1e1e",
  base03 = "#676767",
  base04 = "#7b7b7b",
  base05 = "#D9D9D9",
  base06 = "#7b7b7b",
  base07 = "#f2f2f2",
  base08 = p.red,
  base09 = p.peach,
  base0A = p.yellow,
  base0B = p.green,
  base0C = p.teal,
  base0D = p.sapphire,
  base0E = p.lavender,
  base0F = p.maroon,
}

M.type = "dark"

M = require("base46").override_theme(M, "vira_carbon")

return M
