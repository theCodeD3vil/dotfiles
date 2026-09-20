require "nvchad.mappings"

-- add yours here

local map = vim.keymap.set

map("n", ";", ":", { desc = "CMD enter command mode" })
map("i", "jk", "<ESC>")

-- map({ "n", "i", "v" }, "<C-s>", "<cmd> w <cr>")

-- nowait so <leader>xx below doesn't delay this by timeoutlen
map("n", "<leader>x", function()
  require("nvchad.tabufline").close_buffer()
end, { desc = "buffer close", nowait = true })

-- diagnostics (see lua/diagnostics.lua)
map("n", "<leader>dt", "<cmd>ToggleDiagnostic<cr>", { desc = "Toggle diagnostics" })

-- recompile base46 cache (chadrc edits don't apply until this runs)
map("n", "<leader>tr", function()
  require("base46").load_all_highlights()
end, { desc = "Reload theme/highlights (base46)" })

-- toggle + persist transparency (rewrites chadrc.lua's transparency line too)
map("n", "<leader>tt", function()
  require("base46").toggle_transparency()
end, { desc = "Toggle transparency" })

-- dap keymaps live in lua/configs/dap.lua (<leader>d[b|c|i|o|O|r|u])

-- trouble
map("n", "<leader>xx", "<cmd>Trouble diagnostics toggle<cr>", { desc = "Diagnostics (Trouble)" })
map("n", "<leader>xX", "<cmd>Trouble diagnostics toggle filter.buf=0<cr>", { desc = "Buffer Diagnostics (Trouble)" })
map("n", "<leader>xs", "<cmd>Trouble symbols toggle focus=false<cr>", { desc = "Symbols (Trouble)" })
map("n", "<leader>xl", "<cmd>Trouble lsp toggle focus=false win.position=right<cr>", { desc = "LSP Definitions / references (Trouble)" })
map("n", "<leader>xL", "<cmd>Trouble loclist toggle<cr>", { desc = "Location List (Trouble)" })
map("n", "<leader>xQ", "<cmd>Trouble qflist toggle<cr>", { desc = "Quickfix List (Trouble)" })
