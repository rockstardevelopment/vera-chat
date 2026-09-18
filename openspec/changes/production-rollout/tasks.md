> Carried from `manual-deploy-ci` (archived 2026-09-15). Every task needs repository-admin, DigitalOcean, or droplet SSH access, or triggers a real production deployment.

## 1. Production Environment and Droplet

- [ ] 1.1 **[HUMAN]** Create the `production` GitHub Environment and populate `DROPLET_HOST`, `DROPLET_USER`, `DROPLET_SSH_KEY`, `DROPLET_KNOWN_HOSTS` (and `DROPLET_PORT` if non-standard); verify the environment appears in repository settings with its secrets (carried from manual-deploy-ci 5.2)
- [ ] 1.2 **[HUMAN]** Provision the production $4 droplet per `vera-docs/deployment.md`; verify `docker compose version` reports >= 2.24, `swapon --show` reports an active swap file, and the deploy user can run Docker (carried from manual-deploy-ci 5.4)

## 2. Production Dispatch and Rollback Verification

- [ ] 2.1 **[HUMAN]** Dispatch the production workflow from `main`; verify the run succeeds, the deployed image tag contains the full commit SHA, and `/health` responds (carried from manual-deploy-ci 6.3)
- [ ] 2.2 **[HUMAN]** Dispatch production with an older commit reachable from `main` in `commit_sha`; verify the build is skipped when its image exists, and the droplet checkout, configuration, and running image all describe that commit (carried from manual-deploy-ci 6.4)
- [ ] 2.3 **[HUMAN]** Verify on the production droplet that `.env` is byte-identical before and after a deploy (compare a hash taken around a run) (carried from manual-deploy-ci 6.6)
- [ ] 2.4 **[HUMAN]** Dispatch production with a non-existent commit and with a commit not reachable from `main`; verify each run fails before the build job (carried from manual-deploy-ci 6.7)
