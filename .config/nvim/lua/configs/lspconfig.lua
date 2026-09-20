require("nvchad.configs.lspconfig").defaults()

-- custom signs + on/off diagnostic config, :ToggleDiagnostic to flip it
require "diagnostics"

local servers = { "html", "cssls" }
vim.lsp.enable(servers)

-- read :h vim.lsp.config for changing options of lsp servers 
