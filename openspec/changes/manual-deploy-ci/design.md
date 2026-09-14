## Context

See proposal.md for motivation. The constraints that shape the approach:

- The fork is a public repository (`rockstardevelopment/vera-chat`) with `main` as its only long-lived branch. Actions currently registers zero workflows even though 30 inherited upstream workflow files exist on `main`; enabling Actions without relocating those files would activate all of them.
- Upstream's `deploy-compose.yml` defines the API image as `registry.librechat.ai/danny-avila/librechat-dev-api:latest`, hard-codes `MONGO_URI=mongodb://mongodb:27017/LibreChat` as a service-level environment value (which overrides `.env`), and lists `mongodb` and `rag_api` in `api.depends_on`.
- `config/deployed-update.js` documents upstream's VPS pattern — host checkout, operator-owned `.env`, `docker compose pull api && up -d` — and calls out that overriding the `api` image leaves dangling images that nothing reclaims.
- The application exposes `GET /health` (api/server/index.js:310) and serves the built client from the same container, so a single `api` service can be the entire droplet runtime.
- Droplets are $4 DigitalOcean Basic (512 MiB RAM, 1 vCPU, 10 GiB SSD, no domain). MongoDB is external (Atlas) as a separate task; `.env` on each droplet is operator-owned. The image build is heavy and must never run on the droplet; Actions minutes are free for public repositories.

## Goals / Non-Goals

**Goals:**

- One honest, repeatable deploy path per environment, triggered only by a human.
- Enabling Actions registers nothing inherited from upstream.
- Reuse upstream's compose definition where it remains useful and avoid touching upstream-owned files that the fork regularly merges.
- Make a failed rollout visible in the Actions run rather than silently serving a broken container.

**Non-Goals:**

- Multi-architecture images (droplets are amd64; arm64 would add QEMU cost for no user).
- Zero-downtime release (single-container recreate with a short health gap is accepted).
- Blue/green, canary, or automated rollback.
- CI for tests, lint, or reviews; notifications; droplet provisioning automation.
- Registry credential management on the droplet (public GHCR packages pull anonymously).

## Decisions

### 1. Inherited workflows move out of the scanned directory

`.github/workflows/*` moves verbatim to `.github/workflows-disabled/`. GitHub only scans `.github/workflows/` for workflow definitions, so the files survive review but cannot register, be triggered, or be dispatched.

- Alternatives: `gh workflow disable` per workflow (server-side state, a 30-workflow sweep at enable time, silently reversible by anyone with admin rights); neutering `on:` triggers (still registers, edits 30 upstream-owned files and creates recurring merge conflicts); deleting (violates "kept for later review").
- The move is a pure rename; contents stay byte-identical, which the spec's "Preserved for later review" scenario checks.

### 2. Two self-contained workflows, one per environment

`deploy-development.yml` and `deploy-production.yml` are separate files rather than one workflow with an `environment` input. Their guards, environments, and concurrency groups all differ, and a separate file makes misdispatch harder to construct: the development path can never reference production credentials or vice versa.

- Ref guard: development requires `startsWith(github.ref_name, 'feature/')`, production requires `github.ref_name == 'main'`. The guard job runs first and fails before the build job, so a wrong dispatch costs seconds, not a 10-20 minute image build.
- Alternatives: a single matrix workflow (branching on ref inside jobs makes both guards bypassable by editing one place); relying on the dispatch UI alone (no enforcement).

### 3. Build at dispatch, address images by commit SHA

Each workflow builds `Dockerfile.multi` target `api-build` with `linux/amd64` and pushes to `ghcr.io/rockstardevelopment/vera-chat-api` with tags `sha-<full-sha>` and a moving `dev`/`prod` tag. There are no push-triggered builds: every published image corresponds to a deliberate deploy.

- Production accepts an optional `image_tag` dispatch input. When provided, the build job is skipped and the given `sha-*` tag is deployed, which is the rollback mechanism. A tag that does not resolve fails at pull time on the droplet.
- Build args `BUILD_COMMIT`, `BUILD_BRANCH`, and `BUILD_DATE` are passed through as upstream does, so Settings → About can identify the deployed commit.
- Layer cache uses `type=registry` in GHCR (`mode=max`) rather than `type=gha`: it is readable across branches and avoids the 10 GB Actions cache cap, mirroring upstream's own choice.
- Alternatives: reusing upstream's `docker-publish.yml` (requires Docker Hub secrets and builds arm64; also moved to the disabled directory); building on the droplet (512 MiB cannot host a LibreChat build).

### 4. Layered compose overlay instead of a standalone file

`deploy-compose.vera.yml` is layered over upstream's file (`docker compose -f deploy-compose.yml -f deploy-compose.vera.yml`) and does four things:

```yaml
services:
  api:
    image: ${VERA_API_IMAGE:?VERA_API_IMAGE is required}
    environment:
      - MONGO_URI=${MONGO_URI}   # undo upstream's service-level default
    depends_on: !reset []        # upstream's dependents are profile-gated off
  mongodb:    { profiles: [bundled-mongo] }
  meilisearch:{ profiles: [search] }
  rag_api:    { profiles: [rag] }
  vectordb:   { profiles: [rag] }
  admin-panel:{ profiles: [admin] }
  client:     { profiles: [proxy] }
```

- Rationale: the fork inherits upstream's `api` environment block, proxy variables, bind mounts, and restart policy for free, and upstream improvements reach the fork without a manual sync. A standalone file would duplicate ~30 lines and drift.
- `MONGO_URI=${MONGO_URI}` is mandatory: without it the service-level value wins over the droplet `.env` and the app would try to reach a container that no longer runs.
- `depends_on: !reset []` is required because Compose refuses to start `api` when its declared dependencies are not enabled by an active profile. `!reset` needs Compose ≥ 2.24; droplets must meet it (Ubuntu 24.04's Docker packages do).
- Alternative: editing `deploy-compose.yml` directly — smaller file count, but every future upstream merge conflicts on it.

### 5. SSH from the runner, compose on the droplet

The deploy job writes the environment's SSH key to a temporary file, connects with `DROPLET_KNOWN_HOSTS` pinned (no `StrictHostKeyChecking=no`), and runs:

```text
git -C /opt/vera-chat fetch origin <ref> && git checkout -f <ref> && git reset --hard <ref>
VERA_API_IMAGE=ghcr.io/.../vera-chat-api:sha-<sha> docker compose -f deploy-compose.yml -f deploy-compose.vera.yml pull api
VERA_API_IMAGE=... docker compose ... up -d --wait
curl -fsS http://127.0.0.1:3080/health
docker image prune -f
```

- The checkout is cloned from the public HTTPS URL on first deploy, then converged on every deploy; the droplet needs no GitHub credentials.
- `git reset --hard` is acceptable on a deploy target because operators never edit tracked files there; their configuration lives in `.env`, which is untracked and untouched.
- `docker image prune -f` runs after the pull, reclaiming the superseded API image on a 10 GiB disk.
- Alternatives: self-hosted runner on the droplet (public repository makes this an unacceptable security posture, and the runner consumes scarce RAM); Watchtower image polling (no control over config sync, ordering, or health gating); Docker context over SSH (still needs config files on the host, so no simplification).

### 6. Environment-scoped secrets, operator-owned `.env`

GitHub Environments `development` and `production` hold `DROPLET_HOST`, `DROPLET_USER`, `DROPLET_SSH_KEY`, `DROPLET_KNOWN_HOSTS`, and optional `DROPLET_PORT`. The deploy job declares `environment:` so a job can only see its own environment's secrets.

- `.env` stays on the droplet and is never read or written by CI. The non-comment payload is ~5.3 KB (fits GitHub's 48 KB secret limit, so CI-managed `.env` is possible) but coupling config rotation to redeploys is not worth it for a two-droplet tryout.
- No registry secret is needed on the droplet because GHCR packages from public repositories pull anonymously.

### 7. Per-environment concurrency, no cancellation

`concurrency: { group: deploy-<environment>, cancel-in-progress: false }`. A newly dispatched run waits for the running one; interrupting a `compose up` mid-recreate is worse than waiting.

### 8. $4 droplets with swap and a heap cap

Atlas moves MongoDB off the droplet, and profile-gating leaves only `api`: roughly 100 MiB OS + 80-120 MiB Docker daemon + 200-300 MiB Node process. That is workable on 512 MiB, but not with headroom, so `vera-docs/deployment.md` requires a 1-2 GiB swap file and `NODE_OPTIONS=--max-old-space-size=320` in the droplet `.env` so V8 garbage-collects instead of being OOM-killed. Upgrading vertically (DO preserves the disk on resize) is the scaling path.

## Risks / Trade-offs

- [Plain HTTP deploys expose credentials and session tokens in cleartext] → Accepted for a no-domain tryout; treat both environments as non-public until TLS (Cloudflare Tunnel is the cheapest follow-up). Documented in `vera-docs/deployment.md`.
- [512 MiB OOM under agent/tool spikes] → Swap plus heap cap; the health gate turns an OOM restart loop into a failed deploy instead of a silent outage.
- [Environment secrets can be reached by anyone who can push a `feature/*` branch and dispatch the development workflow] → Development secrets only ever cover the dev droplet; production dispatch is restricted to `main`, and GitHub Environment protection rules can require review later without changing these artifacts.
- [The first dispatch requires the workflow to exist on the default branch, and a feature branch can only be selected once it contains the workflow file] → Operational sequencing in the migration plan; if deploying pre-existing branches becomes necessary, a `target_ref` input checked out by the build job is the follow-up.
- [`!reset` fails on Compose < 2.24] → Minimum version becomes a documented droplet prerequisite; the failure is immediate and legible rather than partial.
- [Rollback by `image_tag` leaves config at `main` while the image is older] → Acceptable for this scope; a true config rollback is a git revert on `main` followed by a normal dispatch.
- [Dangling images accumulate on 10 GiB disks] → Prune after every successful pull; the same problem is documented upstream in `config/deployed-update.js`.
- [Future upstream merges conflict on the moved workflow paths] → The disabled files are intentionally frozen; conflicts there are mechanical and can be resolved by taking upstream's content into the disabled directory.

## Migration Plan

1. Land this change. If a `dev` branch exists by then, merge there and fast-forward `main`; production dispatch works from `main` either way.
2. Create the `development` and `production` GitHub Environments and populate their secrets.
3. Provision both droplets: Docker Engine + Compose ≥ 2.24, git, a sudo-capable deploy user, the runner's public key, 1-2 GiB swap, and an operator-owned `.env` (`DOMAIN_CLIENT`/`DOMAIN_SERVER` set to `http://<droplet-ip>:3080`, plus `NODE_OPTIONS`). Point `MONGO_URI` at Atlas when that task lands.
4. Enable Actions for the repository **after** the workflow move is on `main`, so only the two deployment workflows ever register. If Actions is already enabled, disable the inherited workflows via the API while the move merges.
5. First deploy: dispatch development from a `feature/*` ref and verify `/health`, then dispatch production from `main`.
6. Rollback: dispatch production with the previous `image_tag` value.

## Open Questions

- Whether production should require a GitHub Environment approval before deploying — a repository setting, orthogonal to these artifacts.
- TLS path (Cloudflare Tunnel vs. a domain plus Caddy) — a follow-up change; the compose overlay already profile-gates a proxy service for it.
- Whether pre-existing `feature/*` branches need deployability before they contain the workflow file — deferred until the first time it matters.
