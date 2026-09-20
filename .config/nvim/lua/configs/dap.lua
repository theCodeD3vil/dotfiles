-- nvim-dap-ui setup + keymaps. Loaded from the nvim-dap-ui plugin spec so
-- both dap and dap-ui are guaranteed to be present by the time this runs.

local dap = require "dap"
local dapui = require "dapui"

dapui.setup()

dap.listeners.after.event_initialized["dapui_config"] = function()
  dapui.open()
end
dap.listeners.before.event_terminated["dapui_config"] = function()
  dapui.close()
end
dap.listeners.before.event_exited["dapui_config"] = function()
  dapui.close()
end

local map = vim.keymap.set

map("n", "<leader>db", dap.toggle_breakpoint, { desc = "Dap toggle breakpoint" })
map("n", "<leader>dc", dap.continue, { desc = "Dap continue / start" })
map("n", "<leader>di", dap.step_into, { desc = "Dap step into" })
map("n", "<leader>do", dap.step_over, { desc = "Dap step over" })
map("n", "<leader>dO", dap.step_out, { desc = "Dap step out" })
map("n", "<leader>dr", dap.repl.toggle, { desc = "Dap toggle repl" })
map("n", "<leader>du", dapui.toggle, { desc = "Dap-UI toggle" })
