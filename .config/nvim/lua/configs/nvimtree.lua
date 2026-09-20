-- merges onto NvChad's own nvim-tree opts (lazy.nvim passes those in as the
-- 2nd arg when opts is a function) so we only touch the folder glyphs,
-- not the whole config.
return function(opts)
  opts.renderer = opts.renderer or {}
  opts.renderer.icons = opts.renderer.icons or {}
  opts.renderer.icons.glyphs = opts.renderer.icons.glyphs or {}
  opts.renderer.icons.glyphs.folder = vim.tbl_extend("force", opts.renderer.icons.glyphs.folder or {}, {
    default = "\u{f07b}", -- nf-fa-folder (closed)
    open = "\u{f115}", -- nf-fa-folder_open
  })
  return opts
end
