return {
  {
    "stevearc/conform.nvim",
    -- event = 'BufWritePre', -- uncomment for format on save
    opts = require "configs.conform",
  },

  -- These are some examples, uncomment them if you want to see them work!
  {
    "neovim/nvim-lspconfig",
    -- no event/cmd/ft/keys trigger => under this config's `defaults.lazy = true`
    -- (see configs/lazy.lua) it would otherwise never load at all
    lazy = false,
    config = function()
      require "configs.lspconfig"
    end,
  },

  -- test new blink
  -- { import = "nvchad.blink.lazyspec" },

  -- {
  -- 	"nvim-treesitter/nvim-treesitter",
  -- 	opts = {
  -- 		ensure_installed = {
  -- 			"vim", "lua", "vimdoc",
  --      "html", "css"
  -- 		},
  -- 	},
  -- },

  -- closed/open folder glyphs (U+F07B / U+F115); see lua/highlights.lua
  -- for the open-folder color
  {
    "nvim-tree/nvim-tree.lua",
    opts = function(_, opts)
      return require("configs.nvimtree")(opts)
    end,
  },

  -- debugging
  { "mfussenegger/nvim-dap", event = "VeryLazy" },
  {
    "rcarriga/nvim-dap-ui",
    event = "VeryLazy", -- needs a real trigger or it (and its keymaps) never load
    dependencies = { "mfussenegger/nvim-dap", "nvim-neotest/nvim-nio" },
    config = function()
      require "configs.dap"
    end,
  },

  -- diagnostics/quickfix/refs list
  {
    "folke/trouble.nvim",
    cmd = "Trouble",
    opts = require "configs.trouble",
  },

  -- 2-key jump-to-anywhere motion
  {
    "folke/flash.nvim",
    event = "VeryLazy",
    opts = require "configs.flash",
    keys = {
      { "s", mode = { "n", "x", "o" }, function() require("flash").jump() end, desc = "Flash" },
      { "S", mode = { "n", "x", "o" }, function() require("flash").treesitter() end, desc = "Flash Treesitter" },
      { "r", mode = "o", function() require("flash").remote() end, desc = "Remote Flash" },
      { "R", mode = { "o", "x" }, function() require("flash").treesitter_search() end, desc = "Treesitter Search" },
      { "<c-s>", mode = { "c" }, function() require("flash").toggle() end, desc = "Toggle Flash Search" },
    },
  },
}
