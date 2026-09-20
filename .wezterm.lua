local wezterm = require 'wezterm'
local config = wezterm.config_builder()
local act = wezterm.action
-- Pull in the wezterm API
local wezterm = require("wezterm")

-- This will hold the configuration.
local config = wezterm.config_builder()

-- 1. Setup the shortcut key to prompt for a new title
config.keys = {
  {
    key = 'r',
    mods = 'CMD', -- Uses Command + R. Change to 'OPT' for Option + R if preferred.
    action = act.PromptInputLine {
      description = 'Enter new tab title:',
      action = wezterm.action_callback(function(window, pane, line)
        -- If the user provided text, set it as the tab title
        if line then
          window:active_tab():set_title(line)
        end
      end),
    },
  },
}

-- 2. Tell WezTerm to respect your custom title instead of auto-overriding it
wezterm.on('format-tab-title', function(tab, tabs, panes, config, hover, max_width)
  local title = tab.tab_title
  -- If a custom title is set, use it
  if title and #title > 0 then
    return title
  end
  -- Otherwise, fall back to the default process/folder name
  return tab.active_pane.title
end)

-- map Option to Alt/Meta on macOS
config.send_composed_key_when_left_alt_is_pressed = false
config.send_composed_key_when_right_alt_is_pressed = false

-- Vira Theme - Carbon (vira-theme-for-terminals/ghostty/Vira-Theme-Carbon.conf,
-- no wezterm variant ships in the pack, translated from the ghostty one)
config.colors = {
	foreground = "#D9D9D9",
	background = "#0A0A0A",
	cursor_bg = "#FFCC00",
	cursor_border = "#FFCC00",
	cursor_fg = "#0A0A0A",
	selection_bg = "#474747",
	selection_fg = "#D9D9D9",
	ansi = { "#45454A", "#c85e60", "#a3c679", "#d5b05f", "#6a90d0", "#a178c4", "#6ebad7", "#D9D9D9" },
	brights = { "#45454A", "#c85e60", "#a3c679", "#d5b05f", "#6a90d0", "#a178c4", "#6ebad7", "#ffffff" },
}

config.font = wezterm.font("Operator Mono Lig")
config.font_size = 16

config.enable_tab_bar = true

config.window_decorations = "RESIZE"
config.window_background_opacity = 0.8
config.macos_window_background_blur = 10


-- BEGIN Factory Droid terminal setup
config.enable_kitty_keyboard = true
config.keys = config.keys or {}
table.insert(config.keys, 1, { key = 'Enter', mods = 'CTRL', action = wezterm.action.SendString '\x1b[13;5u' })
table.insert(config.keys, 1, { key = 'Enter', mods = 'SHIFT', action = wezterm.action.SendString '\x1b[13;2u' })
-- END Factory Droid terminal setup

return config
