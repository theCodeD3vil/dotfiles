-- diagnostic signs + an on/off config, flippable with :ToggleDiagnostic

local M = {}

local signs = {
  DiagnosticSignError = "✘",
  DiagnosticSignWarn = "⚠",
  DiagnosticSignHint = "•",
  DiagnosticSignInfo = "ⓘ",
}

for name, icon in pairs(signs) do
  vim.fn.sign_define(name, { text = icon, texthl = name, numhl = "" })
end

M.on = {
  virtual_text = false, -- signs + float only, less noisy than inline text
  underline = true,
  severity_sort = true,
  signs = true,
  update_in_insert = false,
  float = {
    focusable = false,
    style = "minimal",
    border = "rounded",
    source = true,
  },
}

M.off = {
  virtual_text = false,
  underline = true,
  signs = false,
  update_in_insert = false,
}

vim.g.diagnostics_enabled = true
vim.diagnostic.config(M.on)

vim.api.nvim_create_user_command("ToggleDiagnostic", function()
  vim.g.diagnostics_enabled = not vim.g.diagnostics_enabled
  vim.diagnostic.config(vim.g.diagnostics_enabled and M.on or M.off)
end, {})

return M
