require("nvchad.configs.lspconfig").defaults()

-- custom signs + on/off diagnostic config, :ToggleDiagnostic to flip it
require "diagnostics"

-- Vue/Nuxt: vue_ls runs in "hybrid mode" (template/CSS only), so TypeScript in
-- .vue files has to come from vtsls loaded with the @vue/typescript-plugin.
-- vue_ls forwards its tsserver requests to the vtsls client (see its on_init).
-- Don't enable ts_ls alongside vtsls.
local vue_plugin = {
  name = "@vue/typescript-plugin",
  location = vim.fn.stdpath "data" .. "/mason/packages/vue-language-server/node_modules/@vue/language-server",
  languages = { "vue" },
  configNamespace = "typescript",
}

vim.lsp.config("vtsls", {
  settings = {
    vtsls = { tsserver = { globalPlugins = { vue_plugin } } },
  },
  filetypes = { "typescript", "javascript", "javascriptreact", "typescriptreact", "vue" },
})

-- Two TypeScript servers, one attaches per project (never both: duplicate
-- diagnostics/completions):
--   tsc   - native TypeScript 7 server (`tsc --lsp --stdio`, Mason package `tsc`
--           or the project's own node_modules/.bin/tsc >= 7). Much faster.
--   vtsls - tsserver wrapper. Needed where something has to load into tsserver,
--           which the native server can't: Vue/Nuxt (@vue/typescript-plugin) and
--           tsconfig "plugins".
-- Override per session with `:let g:ts_server = "vtsls"` (or "tsc"), then
-- :LspRestart. Unset it to go back to auto.
local project = require "project"
local vue_configs = { "nuxt.config.ts", "nuxt.config.js", "nuxt.config.mjs", "vue.config.js", "vue.config.ts" }
local vue_pkgs = { "vue", "nuxt", "vue-tsc", "@vitejs/plugin-vue" }

local function wants_vtsls(bufnr)
  if vim.g.ts_server then
    return vim.g.ts_server == "vtsls"
  end
  -- vue_ls forwards to the vtsls client, so .vue buffers always need it
  return vim.bo[bufnr].filetype == "vue"
    or project.uses(bufnr, vue_configs, vue_pkgs)
    or project.has_tsserver_plugins(bufnr)
end

--- only run `name`'s own root_dir when `want(bufnr)`, so the server stays off
--- (no attach) in projects that belong to the other one
local function gate(name, want)
  local root_dir = vim.lsp.config[name].root_dir
  vim.lsp.config(name, {
    root_dir = function(bufnr, on_dir)
      if want(bufnr) then
        root_dir(bufnr, on_dir)
      end
    end,
  })
end
gate("vtsls", wants_vtsls)
gate("tsc", function(bufnr)
  return not wants_vtsls(bufnr)
end)

-- lspconfig's oxlint root_dir calls on_dir(nil) when it finds no oxlint config,
-- which makes nvim start it anyway (single-file mode, default rules) in every
-- js/ts project. Only activate it when a root was actually found.
local oxlint_root_dir = vim.lsp.config.oxlint.root_dir
vim.lsp.config("oxlint", {
  root_dir = function(bufnr, on_dir)
    oxlint_root_dir(bufnr, function(root)
      if root then
        on_dir(root)
      end
    end)
  end,
})

local servers = {
  -- web
  "html",
  "cssls",
  "css_variables",
  "tailwindcss",
  "jsonls",
  -- ts/js + vue/nuxt
  "tsc",
  "vtsls",
  "vue_ls",
  -- linters attach per project, only where their config exists: eslint needs an
  -- eslint config (:LspEslintFixAll), oxlint a .oxlintrc.json / oxlint in
  -- package.json (:LspOxlintFixAll). A project with both gets both.
  "eslint",
  "oxlint",
  -- scripting
  "bashls",
  "basedpyright",
  -- infra
  "docker_language_server",
  "docker_compose_language_service",
  "gh_actions_ls",
  "dotls",
}
vim.lsp.enable(servers)

-- lua_ls is enabled by nvchad.configs.lspconfig above
-- read :h vim.lsp.config for changing options of lsp servers
