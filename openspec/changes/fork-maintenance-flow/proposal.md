# Fork Maintenance Flow

## Why

Both periodic maintenance paths currently require local git. Promoting `dev` to `main` is a
hand-run fast-forward, and an upstream sync merges `upstream/main` directly into `dev` and pushes,
so `dev` is the first place the combined tree is ever built and the merge is never reviewed before
it lands. Two operator actions should be safe to perform through GitHub: a promotion that can only
fast-forward, and an upstream sync that reaches `dev` through a pull request.

## What Changes

- **New promotion workflow.** `.github/workflows/promote-main.yml` is manual-dispatch only, runs
  only when dispatched from `main`, and fast-forwards `main` to `dev`'s head. It creates no commit,
  never force-pushes, fails on divergence without touching any ref, and succeeds as a no-op when
  `main` already equals `dev`. It does not deploy: production deployment stays a separate dispatch.
- **Upstream sync lands through a pull request.** The sync procedure in `vera-docs/fork-workflow.md`
  becomes: branch `feature/upstream-sync-<upstream-short-sha>` from `dev`, merge `upstream/main`
  there, resolve conflicts, open a pull request with base `dev`, and merge it with a merge commit so
  upstream ancestry is preserved for the next sync.
- **Documentation follows.** The promotion section leads with the Actions UI and keeps the local
  commands as the bootstrap (the workflow cannot be dispatched until it exists on `main`) and
  recovery path. The registered-workflow list in `vera-docs/deployment.md` gains the promotion
  workflow.
- No application code, API, schema, or runtime changes.

## Capabilities

### New Capabilities

- `release-promotion`: manual, fast-forward-only promotion of `main` to `dev`'s head through a
  dispatched workflow; creates no commits, never forces, and does not deploy.

### Modified Capabilities

- `deployment`: the "Inherited workflows remain inert" requirement now names the promotion workflow
  alongside the development and production deployment workflows as the registered set.

## Impact

- **GitHub Actions**: new `.github/workflows/promote-main.yml`; the registered workflow set grows
  from two to three. Repository settings are a dependency: workflow permissions must permit
  `contents: write` for the push, and `main` protection, if any, must not reject it.
- **Operator process**: `vera-docs/fork-workflow.md` — rewrite "Syncing upstream" (branch and pull
  request instead of a direct merge into `dev`), update "Promoting `dev` to `main`" (UI action
  first, local commands as bootstrap/fallback), update "Branch roles" for sync branches.
- **Documentation**: `vera-docs/deployment.md` — "Enabling Actions" step lists the promotion
  workflow; `vera-docs/index.md` — the `fork-workflow.md` page summary mentions the UI promotion
  action and the pull-request sync.
- **Pull-request settings**: sync pull requests must be merged with a merge commit; squash or rebase
  would drop the `upstream/main` ancestry and replay every conflict at the next sync.
- **No changes** to application code, APIs, database schemas, or `package.json`.