-- Per-project detection shared by conform (formatter choice) and lspconfig
-- (which TypeScript server to run).

local M = {}

---@param path string
---@return table|nil
local function read_json(path)
  local ok, data = pcall(function()
    return vim.json.decode(table.concat(vim.fn.readfile(path), "\n"))
  end)
  return ok and type(data) == "table" and data or nil
end

--- Directory the upward search starts from and the one it must not leave: the
--- parent of the git root, or $HOME outside git, so a stray config in a parent
--- dir can't claim every project.
---@param bufnr integer
---@return string|nil start, string|nil stop
local function search_bounds(bufnr)
  local name = vim.api.nvim_buf_get_name(bufnr)
  if name == "" then
    return nil
  end
  local dir = vim.fs.dirname(name)
  local git_root = vim.fs.root(dir, ".git")
  return dir, git_root and vim.fs.dirname(git_root) or vim.uv.os_homedir()
end

--- true if the buffer's project uses a package: one of `config_files` somewhere
--- up the tree, or a package.json that lists one of `pkgs` (dependency,
--- devDependency, or a top-level config key like "prettier").
---@param bufnr integer
---@param config_files string[]
---@param pkgs string|string[]
function M.uses(bufnr, config_files, pkgs)
  local dir, stop = search_bounds(bufnr)
  if not dir then
    return false
  end
  local find = { path = dir, upward = true, type = "file", stop = stop }

  if vim.fs.find(config_files, vim.tbl_extend("force", find, { limit = 1 }))[1] then
    return true
  end

  for _, path in ipairs(vim.fs.find("package.json", vim.tbl_extend("force", find, { limit = math.huge }))) do
    local json = read_json(path)
    if json then
      for _, pkg in ipairs(type(pkgs) == "table" and pkgs or { pkgs }) do
        if json[pkg] or (json.dependencies or {})[pkg] or (json.devDependencies or {})[pkg] then
          return true
        end
      end
    end
  end
  return false
end

--- true if the nearest tsconfig.json / jsconfig.json declares compilerOptions
--- "plugins". Those are tsserver plugins, which the native TypeScript 7 server
--- cannot load. Plain text match: tsconfig is JSONC, so vim.json can't parse it.
---@param bufnr integer
function M.has_tsserver_plugins(bufnr)
  local dir, stop = search_bounds(bufnr)
  if not dir then
    return false
  end
  local config = vim.fs.find({ "tsconfig.json", "jsconfig.json" }, {
    path = dir,
    upward = true,
    type = "file",
    stop = stop,
    limit = 1,
  })[1]
  if not config then
    return false
  end
  for _, line in ipairs(vim.fn.readfile(config)) do
    -- skip // comment lines so a commented-out plugins block doesn't count
    if line:match '^%s*"plugins"%s*:' then
      return true
    end
  end
  return false
end

return M
