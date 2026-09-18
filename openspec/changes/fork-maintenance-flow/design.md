## Context

See proposal.md — Why. The fork has two manually dispatched workflows
(`deploy-development.yml`, `deploy-production.yml`) and 30 inert inherited workflows under
`.github/workflows-disabled/`. `main` and `dev` are equal today; the policy keeps `main` a
fast-forward of `dev` (`CLAUDE.md` § "Branching and Pull Requests", `vera-docs/fork-workflow.md`).
`workflow_dispatch` workflows trigger only when the file exists on the default branch (`main`),
and Actions is already enabled with the development deployment exercised. `gh` is not installed on
the operator workstation, so the UI is the intended dispatch surface.

## Goals / Non-Goals

**Goals:**

- A promotion that mechanically enforces the fast-forward invariant and is safe to run from the
  Actions UI.
- An upstream sync procedure that lands on `dev` through a pull request without losing upstream
  ancestry for the next sync.

**Non-Goals:**

- Approval gating for promotion (no environment; repository write access is the control).
- Chaining promotion into the production deployment.
- Changes to the deployment workflows, compose files, or application code.
- Automated conflict resolution, scheduled syncs, or a sync bot.

## Decisions

### 1. Fast-forward in a runner, not via a pull request or the refs API

A `dev` → `main` pull request cannot preserve the invariant: a merge commit adds a commit `dev`
does not have, and squash/rebase rewrite the SHAs, so `main` would no longer be a fast-forward of
`dev`. The REST `PATCH /git/refs/heads/main` with `force: false` enforces the fast-forward
server-side but needs API plumbing and gives no place for the recovery message. The workflow
instead checks out `main` (`fetch-depth: 0`, matching the deploy guards), fetches `dev`, runs
`git merge-base --is-ancestor` for an explicit error, then `git merge --ff-only origin/dev` and
`git push origin main`. The non-force push is the second enforcement layer.

### 2. Idempotent no-op and divergence failure

`main == dev` exits 0 with a summary, mirroring `git merge --ff-only` reporting "Already up to
date". Divergence fails before any ref changes and names the documented recovery: merge `main` into
`dev` through a pull request, then promote again. No force-push path exists in the workflow.

### 3. Dispatch-ref guard

The job runs only when `github.ref_name == 'main'`, consistent with `deploy-production.yml`. The
checkout pins `ref: main` regardless, so the guard protects operator intent rather than correctness.

### 4. No environment, no chained deploy

Promotion declares no `environment:` and requests only `contents: write`; dispatching already
requires write access, and the fast-forward guard is the real protection. It does not call the
deploy dispatch API: promotion and production deployment remain two deliberate decisions. A
`GITHUB_TOKEN` push does not trigger workflows, so the separation holds even without an explicit
guard.

### 5. Upstream sync through a feature branch and pull request

Branch `feature/upstream-sync-<upstream-short-sha>` from `dev`; merge `upstream/main` there;
resolve conflicts against the documented hot spots; open the pull request with base `dev`; merge it
with a merge commit. The merge commit preserves the upstream merge as ancestry so the next sync's
merge base is correct; squash and rebase are forbidden because they erase it. Because the branch is
`feature/*`, `deploy-development.yml` can deploy it to the development droplet before `dev` moves,
so the combined tree is verifiable before it reaches the integration branch.

### 6. Documentation split

`vera-docs/fork-workflow.md` owns the process: the promotion section leads with the UI action and
keeps the local commands as bootstrap and recovery, and the sync section describes the branch and
pull-request path. `vera-docs/deployment.md` gains the promotion workflow in the registered list.
`vera-docs/index.md` summarizes the page. `CLAUDE.md` and `AGENTS.md` stay untouched
(upstream-owned).

## Risks / Trade-offs

- [Repository settings block the promotion push: `main` protection or a workflow-permission
  ceiling] → The run fails before changing any ref; the first dispatch verifies settings. No
  partial state.
- [Bootstrap: the Run workflow button does not exist until the file is on `main`] → Documented;
  the first promotion after landing uses the local fallback.
- [The sync pull request diff spans the whole upstream release, so line review is not meaningful]
  → Documented; review focuses on conflict resolution and the optional development deployment.
- [Squash or rebase merge of a sync pull request destroys ancestry] → Stated in the procedure, and
  a task verifies merge commits are enabled.
- [Diverged `main` blocks promotion] → The failure names the recovery; there is no force path.

## Migration Plan

1. Land the workflow and docs on `dev`; promote to `main` locally once to bootstrap the workflow.
2. Dispatch promotion from the UI: no-op when `main == dev`; after the next feature merge, verify
   `main` reaches `dev`'s head with no new commit and no deployment run.
3. The next upstream sync uses the branch and pull-request path; verify `dev` carries a merge
   commit.

Rollback: revert the workflow and docs through the normal pull-request path. The manual commands
remain documented, so no operational dependency is created.