## Context

See proposal.md — Why. The behavior this change verifies is specified in `openspec/specs/deployment/spec.md`, and the operator procedure is `vera-docs/deployment.md`; both shipped with `manual-deploy-ci` (archived 2026-09-15).

## Goals / Non-Goals

**Goals:**

- Stand up the production environment and droplet, then prove the production workflow and rollback path against them.

**Non-Goals:**

- Any edit to workflows, compose files, or application code.
- TLS, domains, and MongoDB Atlas provisioning.

## Decisions

### 1. Execute the documented procedure without new tooling

The production setup follows `vera-docs/deployment.md` as written and reuses the dispatch inputs the workflows already define. No new scripts or files are introduced: the point of these tasks is to confirm the archived procedure holds on production, not to redesign it.

## Risks / Trade-offs

- [A verification run exposes a defect in a shipped workflow] → Capture the failing run and open a fix change; do not patch workflow files as part of this rollout.

## Migration Plan

1. Create the `production` Environment and its secrets.
2. Provision the droplet per `vera-docs/deployment.md`.
3. Dispatch production from `main`, then exercise the rollback and rejection paths.
