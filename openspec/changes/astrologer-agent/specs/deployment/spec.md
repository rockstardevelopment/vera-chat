## MODIFIED Requirements

### Requirement: Minimal droplet runtime

Deployment SHALL start only the API service by default on each droplet, except that fork-owned auxiliary services required by a deployed feature MAY run alongside the API. Optional upstream services (bundled MongoDB, search, RAG, vector database, admin panel, reverse proxy) SHALL remain defined but inactive. The external MongoDB connection configured in the droplet's environment MUST be honored rather than overridden by a bundled-service default.

#### Scenario: Only the API runs after deploy

- **WHEN** a deployment completes without a fork-owned auxiliary service configured
- **THEN** the running containers on the droplet are limited to the API service

#### Scenario: Fork-owned sidecar runs with its feature

- **WHEN** a deployment completes with the astrology sidecar configured
- **THEN** the API and the astrology sidecar are running and the optional upstream services remain inactive

#### Scenario: External Mongo connection honored

- **WHEN** the droplet's environment points the application at an external MongoDB
- **THEN** the deployed application connects to that external database
