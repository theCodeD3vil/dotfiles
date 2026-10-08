# Architecture reference

Load this when creating or splitting a module, designing how parts talk, or reviewing structure. Naming, function size, and DRY live in `SKILL.md`. Guard clauses, data over branching, and "errors only at real boundaries" live in the `simplicity` skill.

Apply in proportion to size. Layers, interfaces, and injection earn their place only when they remove a real problem in the code in front of you. A script with one entry point needs none of them.

## Pure logic vs side effects

- Put decisions and transforms in pure functions: same input, same output, nothing else touched.
- Push IO (files, network, shell, terminal, clock, randomness) to the edges. The edge reads, calls the pure function, and writes.
- Pure code is easy to reason about and easy to check, even where the repo keeps no committed tests.
- Don't bury a file read or `Date.now()` inside a calculation. Pass the value in.

## State and data

- Immutable by default. Reach for mutation only when a clear gain justifies it.
- Declare a variable at the point of first use, in the smallest scope that works.
- No shared mutable globals. If state must be shared, give it one owner and one way to change it.
- Magic numbers and strings become named constants: `RETRY_LIMIT`, not a bare `3`.
- Use a specific type, or a small named object, where a loose string or number invites mix-ups (a `UserId` vs any string, a `{ x, y }` vs two positional numbers).
- Make invalid states hard to write. A tagged union beats three booleans that must not all be true.

## Module structure

- One responsibility per file. If you can't name the file without "and" or "misc", split it.
- High cohesion inside a module, a small public surface outside. Export what callers need and nothing more.
- No circular imports. If two modules need each other, the shared piece belongs in a third.
- Group by feature or domain, not by kind. Avoid `utils/`, `helpers/`, `common/`: they collect unrelated code and hide where things live.
- Repo rule: a Claude mod can import only files inside its own plugin folder, so shared helpers can't be pulled across mods.

## Error design

`simplicity` says where to check. This says how.

- Fail fast: reject bad input at the boundary, not three calls later.
- Never swallow an error silently. Handle it, or let it propagate.
- Messages carry context: what failed and on which input. `config.json: missing "port"`, not `invalid config`.
- Don't signal failure with `null`, `-1`, or an empty string. Throw, or return a result the caller must check.
- Catch the specific error you can handle. Don't catch everything to hide a bug.

## Coupling

- Tell, don't ask. Tell an object to do the work instead of pulling its fields out and deciding for it.
- Avoid long chains like `a.b.c.d`. They tie the caller to the whole structure.
- Pass dependencies in (arguments, constructor) instead of reaching for a global or hardcoding one. Do this at real seams: IO, time, external services. Not for every function.
- Prefer composition over inheritance. Inherit only for a true is-a relationship, and keep hierarchies shallow.

## Smell checklist

Scan for these in a review. Each one points at a fix above.

- Long function, or a function whose name needs "and"
- Long parameter list, or boolean flag parameters
- God module or class that knows about everything
- Feature envy: a function that mostly uses another module's data
- Shotgun surgery: one change forces edits in many files
- Same logic in two places
- Nesting deeper than about three levels
- Comment explaining confusing code instead of the code being fixed
- Dead code, unused parameters, commented-out blocks
- Mixed vocabulary for one concept (`get` and `fetch` side by side)
