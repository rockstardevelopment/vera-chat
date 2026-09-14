# Fork Workflow

This repository is the [rockstardevelopment/vera-chat](https://github.com/rockstardevelopment/vera-chat)
fork of [danny-avila/LibreChat](https://github.com/danny-avila/LibreChat). The authoritative branch
and pull-request policy is `CLAUDE.md` § "Branching and Pull Requests"; this document only covers
what is specific to the fork. Deployment is documented in [`deployment.md`](./deployment.md).

## Remotes

| Remote | URL | Role |
| --- | --- | --- |
| `origin` | `git@github.com:rockstardevelopment/vera-chat.git` | the fork; all pushes and pull requests go here |
| `upstream` | `https://github.com/danny-avila/LibreChat.git` | read-only source of upstream changes; never push |

```bash
git remote -v
git fetch upstream
```

## Branch roles

- `main` — release branch. Only ever fast-forwarded from `dev`; production deploys from it. No
  direct commits and no force-pushes.
- `dev` — integration branch. Every pull request targets it (`gh pr create --base dev`). Periodically
  receives `upstream/main`.
- `feature/*` — day-to-day work. Branch off `dev`, open the pull request against `dev`, and the only
  refs the development deployment accepts.
- Image tags (`sha-<full-sha>`, `dev`, `prod`) are not git branches; the deploy path addresses
  commits, never branch heads.

## Bootstrapping `dev`

When the fork has no `dev`, create it from the current `main` so the first sync starts from a
known-good tree:

```bash
git fetch origin
git switch -c dev origin/main
git push -u origin dev
```

Then follow "Syncing upstream" below; `main` and `dev` are equal until the first feature merge.

## Feature and pull-request loop

```bash
git fetch origin
git switch dev
git pull --ff-only
git switch -c feature/<issue>-<slug>
# work, commit
git push -u origin feature/<issue>-<slug>
gh pr create --base dev
```

`gh pr create` targets `main` by default because that is the repository's default branch, so pass
`--base dev` explicitly. The upstream workflow that used to retarget such pull requests
(`pr-retarget-dev.yml`) is disabled with the other inherited workflows
(`.github/workflows-disabled/`, see [`deployment.md`](./deployment.md)), so a pull request opened
against `main` by mistake has to be retargeted by hand.

## Syncing upstream

Fold upstream's released branch into `dev` periodically:

```bash
git fetch upstream
git switch dev
git pull --ff-only
git merge upstream/main
git push origin dev
```

Merge `upstream/main`, never `upstream/dev`: upstream's `dev` is LibreChat's own integration branch
with unreleased changes and unrelated history, while this fork tracks upstream's released branch.
Resolve conflicts (see hot spots below), run the checks you normally would, and push.

## Promoting `dev` to `main`

After `dev` is verified, fast-forward `main` — this is what opens the production release:

```bash
git switch main
git pull --ff-only
git merge --ff-only dev
git push origin main
```

The `--ff-only` merge encodes the invariant: `main` never carries a commit that `dev` does not
have. If it fails, the branches have diverged — do not force-push `main`; merge the stray `main`
commit into `dev` first, then promote again. Never commit directly to `main` and never open a
backport pull request to it.

## Conflict hot spots

- `.github/workflows-disabled/` — the 30 inherited workflow files, frozen byte-for-byte. Upstream
  changes to them conflict mechanically; take upstream's content into the disabled directory.
- `package-lock.json` and `bun.lock` — regenerate with the package manager instead of hand-merging.
- `librechat.yaml` — fork configuration; upstream may restructure the example file around it.
- `CLAUDE.md` and `AGENTS.md` — upstream-owned. The fork deliberately leaves both untouched so
  merges stay conflict-free; fork process documentation lives in `vera-docs/`.
- `deploy-compose.yml` — untouched by the fork. Fork deployment changes go in the
  `deploy-compose.vera.yml` overlay.
