## MODIFIED Requirements

### Requirement: Inherited workflows remain inert

All inherited upstream workflow definitions SHALL be preserved unchanged in the repository while being unregisterable by GitHub, so that enabling Actions registers only the fork's manually dispatched deployment and promotion workflows. No inherited workflow may be triggered by pushes, pull requests, schedules, or manual dispatch.

#### Scenario: Registry contains only deployment workflows

- **WHEN** Actions is enabled for the repository after this change lands
- **THEN** the registered workflows are limited to the development and production deployment workflows and the promotion workflow defined in the `release-promotion` capability

#### Scenario: Preserved for later review

- **WHEN** a reviewer inspects the preserved inherited workflow definitions
- **THEN** their contents are unchanged from what the fork inherited