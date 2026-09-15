## Purpose

Provide a manual, fast-forward-only promotion of `main` to `dev`'s head through a dispatched
workflow, so the released branch moves without creating commits and without triggering a
deployment.

## ADDED Requirements

### Requirement: Fast-forward-only promotion of main

Promotion SHALL be triggered only by explicit manual dispatch from `main`, and SHALL update `main`
only when `dev`'s head descends from `main`'s head, moving `main` to that commit unchanged.
Promotion MUST NOT create a commit, merge, rewrite history, or force-push, and MUST leave every ref
unchanged when it cannot fast-forward. When `main` already equals `dev`, the run SHALL succeed
without updating any ref. A promotion that cannot fast-forward MUST fail and report merging `main`
into `dev` as the recovery. Promotion SHALL NOT deploy or trigger a deployment; production
deployment remains a separate manual dispatch.

#### Scenario: Dev ahead of main

- **WHEN** an operator dispatches promotion while `dev` is ahead of `main`
- **THEN** `main` is updated to `dev`'s head with no new commit, and the run reports the previous and new commits

#### Scenario: Main already current

- **WHEN** an operator dispatches promotion while `main` equals `dev`
- **THEN** the run succeeds without updating any ref

#### Scenario: Diverged branches

- **WHEN** `main` has commits that `dev` does not
- **THEN** the run fails without updating any ref and reports merging `main` into `dev` as the recovery

#### Scenario: Non-main dispatch rejected

- **WHEN** promotion is dispatched from a ref other than `main`
- **THEN** the run fails before changing any ref

#### Scenario: Promotion does not deploy

- **WHEN** a promotion succeeds
- **THEN** no deployment workflow run is triggered by it