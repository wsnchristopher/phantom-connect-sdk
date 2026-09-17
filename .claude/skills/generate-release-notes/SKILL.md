# Skill: generate-release-notes

Generate a high-level release note summarising what changed between a git tag and the current codebase.

**Arguments:** `<tag> [package]` — a git tag to diff against (e.g. `v1.2.0`, `@phantom/react-sdk@2.1.0`), and an optional package name to scope the diff (e.g. `@phantom/react-sdk`). If no package is provided, all packages are included.

> **Note:** Release tags live on `https://github.com/phantom/phantom-connect-sdk`. The diff is always performed against the current checkout.

---

## Phase 0 — Determine scope

Parse the arguments:

- `{tag}` — the first argument (required)
- `{package}` — the second argument (optional)

If `{package}` is provided, scope all git diff/log commands to `packages/{package-dirname}/` where `{package-dirname}` is derived from the package name (e.g. `@phantom/react-sdk` → `react-sdk`). Use the package name in the output filename.

If `{package}` is **not** provided, run commands without a path filter to capture all packages, and use `all` in the output filename.

---

## Phase 1 — Resolve the tag commit from the public repo

This checkout may not have release tags. Fetch the commit SHA that the tag points to from the release repository:

```bash
# Get the commit SHA the tag resolves to in the release repository
git ls-remote https://github.com/phantom/phantom-connect-sdk.git "refs/tags/{tag}" "refs/tags/{tag}^{}"
```

Take the **last** SHA returned (the dereferenced `^{}` entry if present, otherwise the only entry). Call this `{public-sha}`.

Then verify this commit exists in the current checkout:

```bash
git -C <repo-root> cat-file -t {public-sha}
```

If the commit is not found, the local checkout and release repository may have diverged in history. Stop and report this to the user.

---

## Phase 2 — Gather raw data

Run the following from the repo root using `{public-sha}` as the base:

```bash
# List commits between the tag SHA and HEAD (scoped to package path if provided)
git log {public-sha}...HEAD --oneline --no-merges [-- packages/{package-dirname}/]

# Full diff summary
git diff {public-sha}...HEAD --stat [-- packages/{package-dirname}/]

# Detailed diff
git diff {public-sha}...HEAD [-- packages/{package-dirname}/]
```

Also check changesets added since the tag:

```bash
git diff {public-sha}...HEAD -- .changeset/
```

And inspect `CHANGELOG.md` files in packages that changed:

```bash
# If package scoped:
git diff {public-sha}...HEAD -- packages/{package-dirname}/CHANGELOG.md
# If all packages:
git diff {public-sha}...HEAD -- packages/*/CHANGELOG.md
```

---

## Phase 3 — Identify changed packages

From the diff stat, group changes by `packages/{name}/` and `examples/{name}/`. For each changed package, note:

- What files changed
- Whether the change touches public API (exports, hook signatures, event shapes, types in `src/index.ts`)
- Whether it's a dependency bump only (check if only `package.json`/`yarn.lock` changed)
- Whether tests were added, modified, or removed

---

## Phase 4 — Read key diffs

For each package with non-trivial changes (not just dependency bumps):

- Read the diff for `src/index.ts` and any exported files to understand public API changes
- Read changeset files (`.changeset/*.md`) to see how changes were categorised (major/minor/patch)
- Look for breaking changes: removed exports, changed function signatures, renamed types

---

## Phase 5 — Write release notes

Produce a structured summary with these sections:

### Breaking Changes

List any removals or incompatible API changes. If none, say "None."

### New Features

Capabilities that didn't exist before — new hooks, new exports, new SDK methods.

### Improvements

Non-breaking enhancements — performance, better error messages, expanded type support, new options on existing APIs.

### Bug Fixes

Specific bugs fixed, with enough context to recognise the scenario.

### Internal / Developer Experience

Build tooling, test improvements, dependency updates, CI changes. Skip pure chore commits unless they affect the developer workflow meaningfully.

### Packages Changed

A table listing each package, its old version (from the tag) and new version, and the change type (major / minor / patch / internal).

---

## Output

Print the release notes in the conversation.

Also write them to `audit/release-notes-{tag}.md` (sanitise the tag for use as a filename: replace `/` and `@` with `-`).

**Hard rules:**

- Base every statement on the actual diff — no guessing
- High-level language: "Added support for X" not "Modified line 42 of foo.ts"
- If a change is ambiguous, say so rather than inventing intent
- Never include internal implementation details that don't affect consumers of the SDK
