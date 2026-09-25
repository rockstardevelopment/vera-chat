## Purpose

Provides the deterministic astrology computation and birth-profile storage that the astrologer agent orchestrates over MCP, so no astrological fact is ever produced by the language model.

## ADDED Requirements

### Requirement: MCP tool surface

The service SHALL expose its capabilities to the agent exclusively through MCP tools, split into profile tools and computation tools: place resolution, profile save, list, update, and delete; and natal chart, transits, horary chart, and elective-window computation. Computation tools SHALL take the target profile identifier explicitly. Tool results SHALL carry computed facts with the engine and option versions that produced them, and MUST NOT contain interpretation.

#### Scenario: Profile round trip

- **WHEN** the agent saves a confirmed birth profile and later lists profiles
- **THEN** the saved profile is returned with its label and resolved place and time metadata

#### Scenario: Facts only

- **WHEN** a computation tool returns
- **THEN** the result contains chart facts and version metadata, with no interpretive text

### Requirement: Place and timezone resolution

The service SHALL resolve a place name to coordinates and an IANA timezone with historical rules. When the input is ambiguous it SHALL return candidate places for confirmation instead of choosing one. When the resolved local time is ambiguous or nonexistent it SHALL report that condition rather than silently selecting an offset.

#### Scenario: Unambiguous place

- **WHEN** the agent resolves a well-known city
- **THEN** the result contains coordinates, country, and IANA timezone

#### Scenario: Ambiguous place

- **WHEN** the place name matches several populated places
- **THEN** the service returns candidates and no profile is stored until one is confirmed

#### Scenario: Nonexistent local time

- **WHEN** the supplied local time does not exist because of a DST forward jump
- **THEN** the service reports the condition instead of guessing

### Requirement: Birth profile storage and privacy

The service SHALL store each user's birth profiles with the birth payload encrypted at rest, scoped to the owning user and tenant. Profile data MUST NOT appear in logs or in results returned for another user. A profile SHALL be deleted on request and when the owning account is deleted.

#### Scenario: Encryption at rest

- **WHEN** a birth profile is stored
- **THEN** the raw stored payload does not reveal the birth date, time, or place

#### Scenario: Caller isolation

- **WHEN** a request asks for another user's profile
- **THEN** the service returns no profile data

#### Scenario: Account deletion

- **WHEN** a user account is deleted
- **THEN** that user's astrological profiles are deleted with it

### Requirement: Trusted caller identity

The service SHALL identify the calling user only from the identity supplied by the LibreChat deployment and MUST reject requests without a trusted identity, returning no profile or computation data.

#### Scenario: Missing identity

- **WHEN** a request arrives without the deployment identity header
- **THEN** the service rejects it and returns no profile data

### Requirement: Operator configuration

House system, orb profile, geocoding provider, and the per-user profile limit SHALL be operator-configurable through the service's deployment configuration. Enforced limits SHALL reject excess profiles with a clear error.

#### Scenario: Profile limit

- **WHEN** a user reaches the configured profile limit
- **THEN** a further save is rejected with a clear error

#### Scenario: House system option

- **WHEN** the operator changes the configured house system
- **THEN** newly computed results reflect it and identify the option version used

### Requirement: Failure behavior

Computation or storage failures SHALL surface as structured errors that identify the failing operation, and the service MUST NOT return partial or fabricated facts in place of a failed computation.

#### Scenario: Engine failure

- **WHEN** a computation cannot complete
- **THEN** the service returns an error identifying the operation and no chart facts

### Requirement: Result reuse

The service MAY reuse computed results for identical inputs and options within a process, and MUST NOT reuse a result produced by a different engine or option version.

#### Scenario: Version change invalidates reuse

- **WHEN** the engine or option version changes
- **THEN** previously computed results are not reused
