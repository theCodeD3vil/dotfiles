-- cross-cutting highlight overrides, wired into chadrc's base46 table
-- `:Telescope highlights` to find any group name; each takes fg/bg/bold/italic/etc,
-- base30 color names work as values too.

local p = require("palette")

local M = {}

-- every key below is verified present in one of base46's own integration
-- files (syntax.lua / treesitter.lua / defaults.lua) — hl_override only
-- takes effect on a key that integration already defines (base46 merges
-- onto it, never adds new groups), so anything not already there is a
-- silent no-op. Keys that are `link = "..."` entries (e.g. @keyword.import)
-- are skipped too since nvim_set_hl ignores sibling style opts on a link;
-- style the link target instead (Include, here).
M.override = {
  -- italic: comments + control-flow keywords + builtin self/this/super
  Comment = { italic = true },
  ["@comment"] = { italic = true },

  Keyword = { italic = true },
  Conditional = { italic = true },
  Repeat = { italic = true },
  Include = { italic = true },

  ["@keyword"] = { italic = true },
  ["@keyword.function"] = { italic = true },
  ["@keyword.operator"] = { italic = true },
  ["@keyword.storage"] = { italic = true },
  ["@keyword.directive"] = { italic = true },
  ["@keyword.directive.define"] = { italic = true },
  ["@keyword.conditional"] = { italic = true },
  ["@keyword.conditional.ternary"] = { italic = true },
  ["@keyword.repeat"] = { italic = true },
  ["@keyword.return"] = { italic = true },
  ["@keyword.exception"] = { italic = true },
  ["@variable.builtin"] = { italic = true },

  -- bold: types + booleans/builtin-constants + headings
  Type = { bold = true },
  Boolean = { bold = true },
  Title = { bold = true },
  ["@type.builtin"] = { bold = true },
  ["@constant.builtin"] = { bold = true },
  ["@markup.heading"] = { bold = true },

  -- bold+italic: todo markers (keeps each integration's own fg/bg)
  Todo = { bold = true, italic = true },
  ["@comment.todo"] = { bold = true, italic = true },

  -- opened folders in nvim-tree: literal Catppuccin Mocha green, not the
  -- active theme's own green (base46/integrations/nvimtree.lua already
  -- defines this key with fg = colors.folder_bg, so it must go in
  -- hl_override, not hl_add — hl_add only merges into the "defaults"
  -- integration, which nvimtree.lua's own dofile then runs after and
  -- would silently clobber)
  NvimTreeOpenedFolderName = { fg = p.green, bold = true },
}

M.add = {}

return M
