---
name: clean-code
description: Keep code readable and well organized with short self-descriptive names, small single-purpose functions, DRY, and clear module structure. Use whenever writing, editing, refactoring, or reviewing code, before naming a variable, constant, function, type, interface, or class, before extracting or splitting a function, and when deciding where code lives.
---

# Clean code

Code should read on its own. A reader should know what a name holds or what a function does without opening its definition or a comment.

Scale the rules to the code. A 30-line script gets the naming, function, and DRY rules. Module and design rules apply when there is a real module to organize.

## 1. Names

Applies to variables, constants, parameters, functions, types, interfaces, and classes.

**Self-descriptive**
- The name says what the thing is or does. `userCount`, `parseConfig`, `ThemeColors`.
- No arbitrary names. Ban `x`, `tmp`, `data`, `val`, `obj`, `foo`, `thing`, `handle`, `doStuff`, `Manager`, `Helper`, `Util` unless nothing more specific is true.
- No one- or two-letter names: not `i`, `n`, `e`, `fn`, `cb`, `el`, `db`, even in short loops and lambdas. Write `index`, `error`, `callback`, `element`. Allowed: `_` for a deliberately unused value.
- Functions are verbs, values are nouns. Booleans read as questions: `isReady`, `hasError`, `canRetry`.
- Types and classes are nouns naming the concept, not the mechanism. Don't add `I` or `Impl` affixes the codebase doesn't already use.
- No abbreviations a newcomer must decode. `config` and `url` are fine; `cfgMgr` is not.

**Short**
- Aim for one to three words. Four is a smell: the scope is too wide or the thing does too much.
- Drop words the context already gives. Inside `User`, use `name`, not `userName`. In `parseConfig`, the argument is `text`, not `configFileContentsAsString`.
- Don't encode the type or the obvious: `users`, not `userListArray`; `getUser`, not `getUserDataFunction`.
- Drop filler: `data`, `info`, `item`, `value`, `get...From...By...` chains.
- Scope sets length. A name used across modules earns more detail; a name used in three lines needs less.

**Consistent**
- One word per concept. Pick `get` or `fetch`, not both; `remove` or `delete`, not both.
- No negated booleans: `isEnabled`, not `isNotDisabled`.
- Put units in the name when the type doesn't carry them: `timeoutMs`, `sizeBytes`.
- Follow the language's casing convention and the file's existing style.

| Bad | Why | Better |
|---|---|---|
| `d`, `elapsedTimeInMillisecondsSinceStart` | too short / too long | `elapsedMs` |
| `list`, `userListArray` | vague / type noise | `users` |
| `process(x)` | verb and argument say nothing | `parseInvoice(text)` |
| `getTheCurrentlyLoggedInUserObject` | a paragraph | `currentUser` |
| `UserDataManagerHelper` | filler words | `UserStore` |

## 2. Functions

- **One job.** If you describe it with "and", split it. Everything in the body sits at one level of abstraction.
- **Few parameters.** Up to three. More than that, pass one object with named fields.
- **No boolean flag parameters.** `render(true)` is unreadable. Split into two functions or pass a named option.
- **Query or command, not both.** A function either returns an answer or changes something. Don't make a getter that mutates.
- **No hidden side effects.** What the name doesn't say, the function doesn't do.

## 3. DRY

- **Extract at the second repeat**, not the third. Fold duplicates into one helper, table, or constant, then confirm behaviour is unchanged (tests, typecheck, snapshots).
- **Dedupe knowledge, not lookalikes.** Two blocks that look alike but change for different reasons stay separate. Merging them couples things that should move independently.
- **Don't fight the platform.** If the platform blocks sharing (Claude mods cannot import across plugin folders), leave the duplicate rather than contort the design.
- Extract on the second *use*, not before it. A helper with one caller is still just indirection (`simplicity`).

## 4. Structure and design

Open `references/architecture.md` when you create or split a module, design how parts talk to each other, decide where code lives, or review for structural smells. It covers:

- Pure logic vs side effects
- State and data
- Module structure
- Error design
- Coupling
- A smell checklist for reviews

Don't load it for a small edit inside one function.

## Before you finish

Re-read what you added or touched:

1. Does every name say what the thing is, with no comment needed? No one- or two-letter or generic names (`data`, `tmp`)? No longer than needed?
2. Does each function do one job with few parameters?
3. Is anything repeated twice that should be one thing?

Rename and refactor within the task only. Leave unrelated code alone, and never rename public or external names (APIs, config keys, file formats) that other things depend on.
