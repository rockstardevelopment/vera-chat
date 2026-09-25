# astrology-service Specification

## Purpose
Provides the deterministic astrology computation and birth-profile storage that the astrologer agent orchestrates over MCP, so no astrological fact is ever produced by the language model. This child defines the computation core: the accuracy gate the capability must pass, and the degradation contract for an unknown birth time.

## Requirements

### Requirement: Deterministic computation and accuracy gate

The service SHALL compute chart facts deterministically from birth or event data and the configured options. Before this capability ships, computation MUST be validated against reference ephemeris output on a fixture set that includes Russian DST transitions, polar latitudes, ambiguous and nonexistent local times, southern-hemisphere data, within documented tolerances for body longitudes, house cusps, and retrograde flags. Engine and option version changes MUST be reflected in results so that reused or stored results can be invalidated.

#### Scenario: Reference agreement

- **WHEN** a fixture chart is computed
- **THEN** body longitudes, Ascendant, Midheaven, house cusps, and retrograde flags agree with the reference within the documented tolerances

#### Scenario: Timezone and DST

- **WHEN** a birth time falls in a historical Russian DST transition
- **THEN** the computed instant matches the reference timezone rules exactly

#### Scenario: Determinism

- **WHEN** the same input and options are computed twice
- **THEN** the facts are identical

### Requirement: Unknown birth time degradation

When birth time is unknown, chart computation SHALL use the documented default local time and SHALL mark the affected results so that Ascendant and house-sensitive facts are not presented as reliable.

#### Scenario: Time-unknown chart

- **WHEN** a chart is computed with an unknown birth time
- **THEN** the result identifies the time confidence and marks house-dependent facts as unreliable
