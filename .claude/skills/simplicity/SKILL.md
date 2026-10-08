---
name: simplicity
description: Keep code simple, easy to understand, and not over-engineered. Use whenever writing, editing, refactoring, or reviewing code or config in this repo (shell scripts, Lua, TypeScript mods, TOML/JSON configs), and before adding any abstraction, option, helper, dependency, or error handling. If an easier or more efficient way exists, take it.
---

# Simplicity

Write the least code that solves the problem as asked. A reader should follow it in one pass, without hunting through indirection.

## Before writing

1. **Does something already provide this?** A tool's native option (`stow`, `brew bundle`, `git`, `jq`), a builtin (`vim.*`, bash parameter expansion), or an existing helper in the repo beats new code.
2. **What is the smallest change that works?** Edit the existing code path before adding a new file, function, or layer.
3. **Is there a shorter, clearer, or faster way?** If yes, use it, even if the first draft is already written. Rewrite instead of defending it.

## Rules

- **No speculative generality.** No flags, options, parameters, hooks, or "extensible" structure for needs that don't exist yet. Add it when the second use shows up.
- **No single-use wrappers.** Inline a helper with one caller. Extract only when it removes real repetition (about three similar uses) or gives a confusing block a clear name.
- **Flat over nested.** Early returns and `continue` instead of deep `if` pyramids.
- **Plain over clever.** No one-liners that need decoding, nested ternaries, regex where `case` or a string op works, or metaprogramming where a list or table works.
- **Data over branching.** A list or map beats an `if/elif` chain whose branches differ only by value.
- **Errors at real boundaries only.** Check user input, files, network, and external commands. Don't guard impossible states or wrap internal calls in try/catch "just in case".
- **No new dependency for a small job.** If it's under ~10 lines with the standard library, write it.
- **Names carry meaning.** Good names replace comments. Comment only the *why* the code can't say (a workaround, a non-obvious constraint), never what the next line does.
- **Delete, don't disable.** Remove dead code, unused variables, and commented-out blocks. Git remembers.
- **Match the surrounding code.** Same style, naming, idiom, and comment density as the file you're in. Don't refactor neighbors unasked.

## Efficiency

Simple and efficient usually agree: one pass instead of many, a builtin instead of spawning a process, skip work that's already done. Don't micro-optimize past that without measuring. Shell startup (`.zshrc`) is the exception: avoid forks and slow subprocesses there.

## Repo specifics

- **Dotfiles are declarative.** Prefer a tool's own config file over a script that generates it, and a Brewfile line or stow link over custom install logic.
- **Bootstrap (`bootstrap/install.sh`)** keeps idempotency, `--dry-run`, and backup-before-overwrite. That is real safety, not over-engineering. Beyond it, write plain sequential steps, not a framework of step runners.
- **Shell:** `set -euo pipefail`, quote variables, use builtins and parameter expansion, skip pipelines where one command does the job.
- **Lua (Neovim):** use `vim.*` APIs and the plugin's own options. Don't wrap plugin setup in helper layers unless they remove repetition.
- **TypeScript (Claude and OpenCode mods):** small modules, no class hierarchies or generic frameworks, no types fancier than the data they describe.

## Simple is not sloppy

- Keep checks that protect data: backups, `--dry-run`, never deleting user files.
- Keep the explanation a future reader needs.
- Don't delete working code outside the task, and don't compress code until it's cryptic. If the short version is harder to read, the longer one wins.

## Before you finish

Re-read the diff and ask:

1. Can any line, function, option, or file go with nothing lost?
2. Would someone new to this file understand it in one read?
3. Did I skip a built-in or existing way to do this?

If something stays complicated for a reason, say why in one sentence.
