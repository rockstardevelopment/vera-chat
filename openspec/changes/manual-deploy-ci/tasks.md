## 1. Preserve Inherited Workflows

- [ ] 1.1 `git mv` all 30 files from `.github/workflows/` to `.github/workflows-disabled/`; verify `ls .github/workflows/` contains no inherited workflow and `git status` reports renames rather than delete/add pairs
- [ ] 1.2 Verify the moved files are byte-identical to `main` with `git diff -M main -- .github/workflows-disabled` (expected: empty) and `git diff -M --summary main` (expected: renames only)

## 2. Fork Compose Overlay

- [ ] 2.1 Create `deploy-compose.vera.yml` pinning `api.image` to `${VERA_API_IMAGE:?}`, setting `MONGO_URI=${MONGO_URI}`, resetting `api.depends_on` with `!reset []`, and placing a profile on each optional service (`mongodb`, `meilisearch`, `rag_api`, `vectordb`, `admin-panel`, `client`); verify with `VERA_API_IMAGE=example MONGO_URI=mongodb+srv://example docker compose -f deploy-compose.yml -f deploy-compose.vera.yml config` that the resolved image, MONGO_URI, and absent `depends_on` match the design, and the command fails cleanly without `VERA_API_IMAGE`
- [ ] 2.2 Verify profile gating with `docker compose -f deploy-compose.yml -f deploy-compose.vera.yml config --format json | jq -r '.services | to_entries[] | select((.value.profiles // []) | length == 0) | .key'` (expected output: only `api`)

## 3. Deployment Workflows

- [ ] 3.1 Add `.github/workflows/deploy-development.yml`: `workflow_dispatch` trigger with an optional `commit_sha` input, a guard job enforcing `startsWith(github.ref_name, 'feature/')` and resolving the commit (the dispatched ref's SHA when empty; otherwise validate it exists in the repository), amd64 build of `Dockerfile.multi` target `api-build` from the resolved commit pushed to `ghcr.io/rockstardevelopment/vera-chat-api` with `sha-<full-sha>` and `dev` tags — skipped when that image already exists — registry layer cache, and a deploy job declaring `environment: development` that checks out the resolved commit on the droplet, runs `pull`/`up -d --wait`, checks `/health`, and prunes images; verify the YAML parses with `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/deploy-development.yml'))"` and that the guard and commit resolution run before any build steps
- [ ] 3.2 Add `.github/workflows/deploy-production.yml` as the counterpart, guarded by `github.ref_name == 'main'`, with the same `commit_sha` input restricted to commits reachable from `main` (`git merge-base --is-ancestor`); verify the workflow skips the build when the resolved `sha-*` image already exists and YAML parses
- [ ] 3.3 Confirm both workflows declare `environment:` only on the deploy job and use per-environment concurrency (`group: deploy-<environment>`, `cancel-in-progress: false`); verify by reading the workflow files for the `environment` and `concurrency` blocks

## 4. Operator Documentation

- [ ] 4.1 Create `vera-docs/deployment.md` covering droplet prerequisites (Docker Engine, Compose >= 2.24, git, sudo-capable deploy user, runner public key, 1-2 GiB swap, operator-owned `.env` with `DOMAIN_CLIENT`/`DOMAIN_SERVER` and `NODE_OPTIONS`), the exact GitHub Environment secret names, dispatch and rollback instructions, and the Actions enablement sequence; verify the documented secret names match every `secrets.*` reference in both workflows
- [ ] 4.2 Create `vera-docs/fork-workflow.md` documenting the fork's remotes (`origin` = `rockstardevelopment/vera-chat`, `upstream` = `danny-avila/LibreChat`), branch roles (`main` release, `dev` integration, `feature/*` work), bootstrapping `dev` from a synced `main`, the feature/branch/PR loop (`gh pr create --base dev`), periodic `git merge upstream/main` into `dev` (never `upstream/dev`), the fast-forward-only `main` invariant (no direct commits, no force-pushes), conflict hotspots (moved workflows, lockfiles, `librechat.yaml`), and a link to `vera-docs/deployment.md`; cross-reference `CLAUDE.md`'s existing "Branching and Pull Requests" section instead of duplicating it; verify the doc names every remote and branch the workflows reference and that `CLAUDE.md` and `AGENTS.md` show no changes in `git status --short`

## 5. Repository and Droplet Setup

- [ ] 5.1 Create the `development` and `production` GitHub Environments and populate `DROPLET_HOST`, `DROPLET_USER`, `DROPLET_SSH_KEY`, `DROPLET_KNOWN_HOSTS` (and `DROPLET_PORT` if non-standard); verify each environment appears in repository settings with its secrets
- [ ] 5.2 Provision both $4 droplets per `vera-docs/deployment.md`; verify `docker compose version` reports >= 2.24, `swapon --show` reports an active swap file, and the deploy user can run Docker
- [ ] 5.3 After the workflow move is on `main`, enable Actions; verify the Actions tab registers only the development and production deployment workflows

## 6. End-to-End Verification

- [ ] 6.1 Dispatch the development workflow from a `feature/*` ref; verify the run succeeds, the droplet serves `/health`, and `docker ps` lists only the API container
- [ ] 6.2 Dispatch the development workflow from `main`; verify the run fails in the guard before the build job starts
- [ ] 6.3 Dispatch the production workflow from `main`; verify the run succeeds, the deployed image tag contains the full commit SHA, and `/health` responds
- [ ] 6.4 Dispatch production with an older commit reachable from `main` in `commit_sha`; verify the build is skipped when its image exists, and the droplet checkout, configuration, and running image all describe that commit
- [ ] 6.5 Verify on both droplets that `.env` is byte-identical before and after a deploy (compare a hash taken around a run) and that no inherited workflow has ever run in the Actions history
- [ ] 6.6 Dispatch production with a non-existent commit and with a commit not reachable from `main`; verify each run fails before the build job
