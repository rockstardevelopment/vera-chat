## Purpose

Provide a manual, environment-scoped path to build the fork's API image and roll it onto pre-provisioned DigitalOcean droplets without activating any inherited upstream automation.

## ADDED Requirements

### Requirement: Ref-guarded manual deployment

Deployment SHALL be triggered only by explicit manual dispatch, and SHALL verify that the dispatched ref matches the target environment before any build or remote action: development accepts only refs under `feature/*`, production accepts only `main`. A non-matching ref MUST abort the run with a clear error.

#### Scenario: Feature branch dispatched to development

- **WHEN** an operator dispatches the development deployment from a `feature/*` ref
- **THEN** the run proceeds to build and deploy to the development droplet

#### Scenario: Non-feature ref dispatched to development

- **WHEN** an operator dispatches the development deployment from a ref outside `feature/*`
- **THEN** the run fails before building or contacting any droplet

#### Scenario: Main dispatched to production

- **WHEN** an operator dispatches the production deployment from `main`
- **THEN** the run proceeds to build and deploy to the production droplet

#### Scenario: Non-main ref dispatched to production

- **WHEN** an operator dispatches the production deployment from any ref other than `main`
- **THEN** the run fails before building or contacting any droplet

### Requirement: Explicit commit selection

Each deployment SHALL accept an optional commit input. When the input is empty, the deployed commit SHALL be the dispatched ref's commit; when present, it MUST name a commit that exists in the repository, and for production that commit MUST be reachable from `main`. An input that is unknown or that fails the production reachability rule MUST abort the run before any build or remote action. The resolved commit SHALL be used consistently for the build checkout, the published image tag, and the droplet checkout. The dispatched-ref guard remains in force regardless of the input.

#### Scenario: Deploy an older production commit

- **WHEN** production is dispatched from `main` with a commit reachable from `main`
- **THEN** the run builds or reuses that commit's image and deploys matching code and configuration

#### Scenario: Development accepts any existing commit

- **WHEN** development is dispatched from a `feature/*` ref with a commit that exists in the repository
- **THEN** the run deploys that commit to the development droplet

#### Scenario: Unknown commit rejected

- **WHEN** the input names a commit that does not exist in the repository
- **THEN** the run fails before building

#### Scenario: Production rejects an unreachable commit

- **WHEN** production is dispatched with a commit not reachable from `main`
- **THEN** the run fails before building

#### Scenario: Guard applies with a valid input

- **WHEN** development is dispatched from a ref outside `feature/*` with a valid commit input
- **THEN** the run still fails on the ref guard before building

### Requirement: Commit-addressed API image publication

Each deployment SHALL build the fork's API image for the amd64 architecture from the resolved commit and publish it to the GitHub Container Registry under a tag containing that commit's full SHA, alongside a moving environment tag. When an image for the resolved commit already exists in the registry, the build MUST be skipped and that image deployed directly. A previously published commit-addressed image MUST remain deployable without rebuilding.

#### Scenario: Image tagged with the resolved commit

- **WHEN** a deployment resolves a commit and no image exists for it
- **THEN** the registry contains an amd64 image tagged with that commit's full SHA that the droplet can pull

#### Scenario: Existing image is deployed without rebuilding

- **WHEN** an operator selects a commit whose image already exists in the registry
- **THEN** the build is skipped and that image content is deployed

### Requirement: Environment-scoped credentials

Credentials and droplet coordinates SHALL be resolved through the GitHub Environment named for the target (`development` or `production`), and a deployment MUST NOT use the other environment's credentials.

#### Scenario: Development credentials isolated from production

- **WHEN** the development deployment runs
- **THEN** it uses only the credentials and droplet coordinates defined on the `development` environment

### Requirement: Idempotent droplet checkout

Deployment SHALL converge the droplet's repository checkout to the resolved commit, cloning it when absent and updating it when present, and MUST NOT modify the droplet's operator-owned environment file.

#### Scenario: First deployment to a bare droplet

- **WHEN** a droplet has no repository checkout yet
- **THEN** the deployment creates one at the resolved commit before deploying

#### Scenario: Existing checkout updated

- **WHEN** the droplet already has a checkout at a different commit
- **THEN** the deployment updates it to the resolved commit before recreating the service

#### Scenario: Explicit commit converges the checkout

- **WHEN** a deployment selects a commit other than the dispatched ref's head
- **THEN** the droplet checkout ends at that commit

#### Scenario: Operator configuration preserved

- **WHEN** any deployment completes
- **THEN** the droplet's environment file is byte-identical to before the deployment

### Requirement: Health-gated rollout

Deployment SHALL wait for the application container to report healthy after recreating it, and SHALL fail the run when the health check does not pass.

#### Scenario: Healthy rollout

- **WHEN** the container starts and the health endpoint responds successfully
- **THEN** the run succeeds

#### Scenario: Unhealthy rollout

- **WHEN** the health endpoint does not respond successfully within the deployment window
- **THEN** the run fails and reports that the service did not become healthy

### Requirement: Minimal droplet runtime

Deployment SHALL start only the API service by default on each droplet; optional upstream services (bundled MongoDB, search, RAG, vector database, admin panel, reverse proxy) SHALL remain defined but inactive. The external MongoDB connection configured in the droplet's environment MUST be honored rather than overridden by a bundled-service default.

#### Scenario: Only the API runs after deploy

- **WHEN** a deployment completes
- **THEN** the running containers on the droplet are limited to the API service

#### Scenario: External Mongo connection honored

- **WHEN** the droplet's environment points the application at an external MongoDB
- **THEN** the deployed application connects to that external database

### Requirement: Serialized deployments per environment

At most one deployment SHALL run per environment at a time, and an in-progress deployment MUST NOT be cancelled by a subsequently dispatched run.

#### Scenario: Second dispatch while a deploy is running

- **WHEN** an operator dispatches a deployment for an environment whose deployment is still running
- **THEN** the new run waits instead of cancelling the running one

### Requirement: Inherited workflows remain inert

All inherited upstream workflow definitions SHALL be preserved unchanged in the repository while being unregisterable by GitHub, so that enabling Actions registers only the deployment workflows. No inherited workflow may be triggered by pushes, pull requests, schedules, or manual dispatch.

#### Scenario: Registry contains only deployment workflows

- **WHEN** Actions is enabled for the repository after this change lands
- **THEN** the registered workflows are limited to the development and production deployment workflows

#### Scenario: Preserved for later review

- **WHEN** a reviewer inspects the preserved inherited workflow definitions
- **THEN** their contents are unchanged from what the fork inherited
