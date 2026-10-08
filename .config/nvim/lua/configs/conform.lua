-- Formatter choice for js/ts/vue/json is per project: prettier where the
-- project uses it, oxfmt otherwise (also the default for projects with neither).
-- Both resolve from the project's node_modules/.bin first, then fall back to
-- the Mason binary on PATH.

local oxfmt_configs = { ".oxfmtrc.json", ".oxfmtrc.jsonc", "oxfmt.config.ts" }

local prettier_configs = {
  ".prettierrc",
  ".prettierrc.json",
  ".prettierrc.yml",
  ".prettierrc.yaml",
  ".prettierrc.json5",
  ".prettierrc.js",
  ".prettierrc.cjs",
  ".prettierrc.mjs",
  ".prettierrc.ts",
  ".prettierrc.cts",
  ".prettierrc.mts",
  ".prettierrc.toml",
  "prettier.config.js",
  "prettier.config.cjs",
  "prettier.config.mjs",
  "prettier.config.ts",
  "prettier.config.cts",
  "prettier.config.mts",
}

-- true if the buffer's project uses the package (see lua/project.lua)
local project_uses = require("project").uses

--- oxfmt unless the project is on prettier. An explicit oxfmt config wins, so a
--- project mid-migration (both present) gets oxfmt.
local function js_formatter(bufnr)
  if project_uses(bufnr, oxfmt_configs, "oxfmt") then
    return { "oxfmt" }
  end
  if project_uses(bufnr, prettier_configs, "prettier") then
    return { "prettier" }
  end
  return { "oxfmt" }
end

--- prettier only where the project uses it; otherwise nothing, so <leader>fm
--- falls back to the language server (html/css/...)
local function prettier_only(bufnr)
  if project_uses(bufnr, prettier_configs, "prettier") then
    return { "prettier" }
  end
  return {}
end

local options = {
  formatters_by_ft = {
    lua = { "stylua" },

    -- Without an entry here <leader>fm would fall back to the ts/vue LSP's own
    -- formatter instead.
    typescript = js_formatter,
    typescriptreact = js_formatter,
    javascript = js_formatter,
    javascriptreact = js_formatter,
    vue = js_formatter,
    json = js_formatter,
    jsonc = js_formatter,

    css = prettier_only,
    scss = prettier_only,
    less = prettier_only,
    html = prettier_only,
    markdown = prettier_only,
    yaml = prettier_only,
  },

  -- format_on_save = {
  --   -- These options will be passed to conform.format()
  --   timeout_ms = 500,
  --   lsp_fallback = true,
  -- },
}

return options
