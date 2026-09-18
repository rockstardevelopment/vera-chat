# Production Rollout

## Why

`manual-deploy-ci` shipped and verified the development deployment path: the inherited workflow move, both deployment workflows, the compose overlay, and the operator documentation. Its production-side steps stayed open because they need repository-admin, DigitalOcean, and droplet access: the `production` GitHub Environment, the production droplet, and the production dispatch and rollback verification runs. That work is carried here.

## What Changes

- Create the `production` GitHub Environment and populate the same secret names used by `development`.
- Provision the production $4 DigitalOcean droplet per `vera-docs/deployment.md`.
- Run the production dispatch and rollback verification series against that droplet.

No repository files change unless a verification run exposes a defect; a defect becomes its own change rather than an edit here.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. The deployment behavior was specified and synced to `openspec/specs/deployment/spec.md` when `manual-deploy-ci` was archived; this change only executes and verifies it.

## Impact

- GitHub repository settings: the `production` Environment and its secrets.
- Infrastructure: one hand-provisioned $4 DigitalOcean droplet.
- Carried from `manual-deploy-ci` tasks 5.2, 5.4, 6.3, 6.4, 6.6, and 6.7.
- No spec-level behavior change, so `.openspec.yaml` declares `skip_specs: true`.
