# Manual Deployment CI for Development and Production

## Why

The fork inherits 30 upstream workflows that cannot succeed here: they expect Docker Hub, Azure, and review-bot credentials this repository does not have. Actions is currently unregistered for the repository, so nothing runs today — but the moment Actions is enabled to support new automation, those workflows become active and will fire on pushes and pull requests. At the same time there is no path to get a build of fork code onto a DigitalOcean droplet: the images referenced by `deploy-compose.yml` are upstream's, not the fork's.

We need the smallest possible CI that builds the fork's API image and deploys it, manually triggered, to pre-provisioned development and production droplets, without letting any inherited workflow run.

## What Changes

- **Inherited workflows become inert by location.** All 30 files under `.github/workflows/` move unchanged to `.github/workflows-disabled/`, which GitHub does not scan. They stay in the repository as reference material for later human review; nothing is deleted. Enabling Actions therefore registers only the new workflows.
- **New `deploy-development.yml`.** Manual `workflow_dispatch` only. Runs only when the dispatched ref matches `feature/*`, otherwise it fails before building. Accepts an optional `commit_sha` input naming any commit that exists in the repository; when omitted, the dispatched ref's commit is used. Builds `Dockerfile.multi` target `api-build` for `linux/amd64` from the resolved commit, pushes `ghcr.io/rockstardevelopment/vera-chat-api:sha-<full-sha>` and `:dev` to GHCR, then deploys to the development droplet over SSH; the resolved commit drives the build checkout, image tag, and droplet checkout.
- **New `deploy-production.yml`.** Manual `workflow_dispatch` only, runs only from `main`. Same build and push (`:sha-<full-sha>` and `:prod`), deploys to the production droplet. Accepts an optional `commit_sha` input restricted to commits reachable from `main`, which is the rollback path; when that commit's image already exists in GHCR the build is skipped and it is deployed directly.
- **New `deploy-compose.vera.yml` overlay.** Layered over upstream `deploy-compose.yml` on the droplet. Pins `api.image` to `${VERA_API_IMAGE}`, restores `MONGO_URI=${MONGO_URI}` so the droplet's `.env` (pointing at MongoDB Atlas) is not overridden by the upstream service-level value, resets `api.depends_on`, and profile-gates `mongodb`, `meilisearch`, `rag_api`, `vectordb`, `admin-panel`, and `client`, leaving only `api` running.
- **New `vera-docs/deployment.md`.** Droplet prerequisites (Docker Engine, Compose plugin, git, a sudo-capable deploy user, 1–2 GiB swap, Node heap cap), the required GitHub Environment secrets, first-dispatch sequencing, and how to deploy or roll back to a previous commit.
- **New `vera-docs/fork-workflow.md`.** Documents the fork's remotes and branch roles, `dev` bootstrap, feature/PR loop, periodic `upstream/main` merge into `dev`, the fast-forward-only `main` invariant, and conflict hotspots. `CLAUDE.md` and `AGENTS.md` are deliberately left untouched so upstream merges stay conflict-free.
- **Health-gated rollout.** The deploy job waits for containers, checks `/health` on the droplet, prunes dangling images after a successful pull, and fails loudly if the app does not come up.

Explicitly out of scope: TLS and domains (both environments run on plain HTTP by droplet IP), MongoDB Atlas provisioning and `MONGO_URI` values (separate task), droplet provisioning automation, test or lint CI, notifications, and re-enabling any inherited workflow.

## Capabilities

### New Capabilities

- `deployment`: manual, ref-guarded deployment of fork-built API images to two pre-provisioned DigitalOcean droplets, with GHCR image publication, health-gated rollout, and inherited upstream workflows kept inert.

### Modified Capabilities

None. The repository has no existing specs, and no application behavior changes.

## Impact

- **GitHub Actions**: 30 inherited workflow files moved; 2 new workflow files added. Actions must be enabled in repository settings after the move lands, and GitHub Environments `development` and `production` must be created with `DROPLET_HOST`, `DROPLET_USER`, `DROPLET_SSH_KEY`, `DROPLET_KNOWN_HOSTS` (and optionally `DROPLET_PORT`).
- **Deployment configuration**: new `deploy-compose.vera.yml`; `deploy-compose.yml` itself is untouched, keeping the fork merge-friendly with upstream.
- **Documentation**: new `vera-docs/deployment.md` and `vera-docs/fork-workflow.md`.
- **Infrastructure**: two $4 DigitalOcean droplets (512 MiB / 1 vCPU / 10 GiB), Mongo hosted externally on Atlas; vertical resize is the scaling path.
- **Runtime**: `.env` on each droplet remains operator-owned and is never written by CI; only code, compose files, and the API image move during a deploy.
- **No changes** to application code, APIs, database schemas, or `package.json`.
