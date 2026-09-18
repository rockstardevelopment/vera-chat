# Deployment

Fork-specific deployment of the API image to two pre-provisioned DigitalOcean droplets. Branch and
PR rules live in `CLAUDE.md` § "Branching and Pull Requests"; the fork's git topology is in
[`fork-workflow.md`](./fork-workflow.md).

## Overview

Two GitHub Actions workflows, manual dispatch only:

| Environment | Workflow | Allowed dispatch ref | Image tags | GitHub Environment |
| --- | --- | --- | --- | --- |
| development | `.github/workflows/deploy-development.yml` | `feature/*` | `sha-<full-sha>`, `dev` | `development` |
| production | `.github/workflows/deploy-production.yml` | `main` | `sha-<full-sha>`, `prod` | `production` |

Each run resolves one commit, builds `Dockerfile.multi` target `api-build` for `linux/amd64` from
that commit, and pushes it to `ghcr.io/rockstardevelopment/vera-chat-api`. Over SSH it then converges
`/opt/vera-chat` on the droplet to the same commit, pulls `sha-<full-sha>`, recreates the API
container, waits for `/health`, and removes the images no container references.

- The commit is the dispatched ref's head, or the optional `commit_sha` input. Development accepts
  any commit that exists in the repository; production accepts only commits reachable from `main`.
- When the commit's `sha-<full-sha>` image already exists, the build is skipped and that image is
  deployed — this is the rollback path.
- Deploys are serialized per environment (`concurrency: deploy-<environment>`, no cancellation), and
  the droplet's `.env` is never read or written by CI: only code, compose files, and the image move.
- Only commits at or after the change that introduced this document are deployable; older commits
  have no `deploy-compose.vera.yml` or workflow.

## Droplet prerequisites

### Software

- Docker Engine with the Compose plugin, `docker compose version` >= 2.24 (the overlay uses
  `!reset`).
- `git` and `curl`; the deploy script runs both.
- A deploy user that can run `docker` (member of the `docker` group) and write to `/opt/vera-chat`.
  The workflow runs git and Compose as this user and never uses `sudo`.

```bash
sudo adduser deploy
sudo usermod -aG docker deploy
sudo install -d -o deploy -g deploy /opt/vera-chat
```

### SSH access

Generate a key pair per environment so the development key only authorizes the development droplet:

```bash
ssh-keygen -t ed25519 -C "vera-deploy-development" -f ~/.ssh/vera_deploy_development
```

Install the public half in `/home/deploy/.ssh/authorized_keys` on that droplet. Store the private
half as `DROPLET_SSH_KEY` in the matching GitHub Environment. Known hosts:

```bash
ssh-keyscan -H <droplet-ip> > /tmp/known_hosts
```

Confirm the key fingerprint out of band before trusting the output. Store it as
`DROPLET_KNOWN_HOSTS`; the workflow pins it and refuses an unknown host.

### Swap and heap cap

512 MiB of RAM is tight: Atlas hosts MongoDB off the droplet and only the API container runs, but
Node needs headroom. Create 1–2 GiB of swap and cap the V8 heap in `.env`.

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
swapon --show
```

Vertical resize (DigitalOcean preserves the disk) is the scaling path when the heap cap is not
enough.

### Operator-owned `.env`

Create `/opt/vera-chat/.env` (the directory may exist before the first deploy; the deploy creates
the checkout around it). CI never modifies the file.

```dotenv
DOMAIN_CLIENT=http://<droplet-ip>:3080
DOMAIN_SERVER=http://<droplet-ip>:3080
NODE_OPTIONS=--max-old-space-size=320
MONGO_URI=mongodb+srv://<user>:<password>@<cluster>/<db>
```

`MONGO_URI` is read by Compose interpolation (`deploy-compose.vera.yml` resets the service-level
default so this value wins) and by the application. Add any other application settings here.

Neither environment has TLS: both run plain HTTP on the droplet IP. Credentials and session tokens
travel in cleartext, so treat both as non-public until TLS (for example a Cloudflare Tunnel) lands.

## GitHub Environments and secrets

Create the `development` and `production` environments under repository Settings → Environments, and
give each one these secrets:

| Secret | Required | Value |
| --- | --- | --- |
| `DROPLET_HOST` | yes | droplet IP or hostname |
| `DROPLET_USER` | yes | deploy user |
| `DROPLET_SSH_KEY` | yes | private key whose public half is in that user's `authorized_keys` |
| `DROPLET_KNOWN_HOSTS` | yes | `ssh-keyscan` output for the droplet |
| `DROPLET_PORT` | no | SSH port; defaults to 22 when empty |

`GITHUB_TOKEN` is supplied automatically and used for the GHCR push. Nothing is configured on the
droplet: the container package pulls anonymously from the public repository. If the package is not
public after the first push, open Package settings → Danger Zone → Change visibility → Public, or
the droplet's `docker compose pull` will be unauthorized.

Convenience (`gh secret set --env` creates the environment if it does not exist):

```bash
gh secret set DROPLET_HOST --env development --body "203.0.113.10"
gh secret set DROPLET_USER --env development --body "deploy"
gh secret set DROPLET_SSH_KEY --env development < ~/.ssh/vera_deploy_development
gh secret set DROPLET_KNOWN_HOSTS --env development < /tmp/known_hosts
gh secret set DROPLET_PORT --env development --body "2222"   # only if non-standard
```

Repeat with `--env production` and the production droplet's values.

## Enabling Actions

The 30 inherited upstream workflows live in `.github/workflows-disabled/`, which GitHub does not
scan, and are kept byte-for-byte for later review. Land the move on `main` first, then:

1. Repository Settings → Actions → General → allow actions and save.
2. Open the Actions tab. Only "Deploy Development" and "Deploy Production" should be registered.
3. If Actions was already enabled before the move landed, disable the inherited workflows
   (`gh workflow disable <name>`) until the move merges — otherwise pushes and pull requests can
   fire them.

## Dispatch and rollback

Development, from a `feature/*` ref:

```bash
gh workflow run deploy-development.yml --ref feature/my-branch
gh workflow run deploy-development.yml --ref feature/my-branch -f commit_sha=<sha>
```

Production, from `main` (the input must be reachable from `main`):

```bash
gh workflow run deploy-production.yml --ref main
gh workflow run deploy-production.yml --ref main -f commit_sha=<sha>
```

Rollback is the same dispatch with `commit_sha` set to an older commit: the build is skipped when
that commit's image exists and the droplet pulls it directly.

```bash
gh run list --workflow deploy-production.yml --limit 5
gh run watch <run-id>
```

Then verify on the droplet:

```bash
ssh deploy@<droplet-ip> 'cd /opt/vera-chat && git rev-parse HEAD && docker ps'
curl -fsS http://<droplet-ip>:3080/health
```

`docker ps` lists only the API container; `git rev-parse HEAD` must equal the deployed commit.

The workflow file must exist on the dispatched ref. Branches created before this change do not
carry it: dispatch from any branch that does (a `feature/*` branch for development, `main` for
production) and name the target commit in `commit_sha`.

Up: [`vera-docs/index.md`](./index.md) — the documentation map.
