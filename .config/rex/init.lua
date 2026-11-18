-- Rex config, stowed to ~/.config/rex/init.lua. It holds keys, actions and scripts; the look
-- (theme, glass) is set in Rex's Settings.

-- Command palette: "Use Catppuccin Mocha (Ghostty)". Imports the theme Ghostty uses (theme in
-- .config/ghostty/config) and selects it, so Rex's own background is #1e1e2e as in Ghostty, the
-- color opencode's catppuccin theme paints.
rex.action{
  name  = "ghostty_theme",
  title = "Use Catppuccin Mocha (Ghostty)",
  run   = function()
    rex.client.queue("client.theme.import", {
      path = "/Applications/Ghostty.app/Contents/Resources/ghostty/themes/Catppuccin Mocha",
    })
  end,
}
