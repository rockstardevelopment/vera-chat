# Astrology consultation — design

Status: draft. Scope: MVP foundation, four jobs. Decisions: MIT TypeScript engine (`caelus`) behind
an accuracy gate; Western tropical zodiac with Placidus houses; computation in-process; structured
interpretation knowledge base narrated by the LLM.

Companion docs: a plain-language walkthrough with a full glossary is in
[`astrology-explained.md`](./astrology-explained.md) (English) and
[`astrology-explained.ru.md`](./astrology-explained.ru.md) (Russian).

## 1. Scope

MVP jobs:

| Job   | User outcome                                 | Required inputs                  |
| ----- | -------------------------------------------- | -------------------------------- |
| JS-01 | Whole-person reading through the natal chart | Birth date, time, place          |
| JS-02 | Strengths, abilities, resources              | Natal chart                      |
| JS-11 | Current life period and its influences       | Natal chart + transits to now    |
| JS-14 | Answer to a specific life question           | Natal chart + question + context |

Later phases add the remaining stories: money, career, relationships, forecasts and period choice
(Phase 2); purpose, karma, Solar return, lunar planning (Phase 3); synastry, family, cycles,
complex analysis (Phase 4).

Non-goals in MVP: Vedic/sidereal zodiac, birth-time rectification, synastry UI, election windows,
payments.

The 29 stories are modeled as a **job catalog** — declarative data, not code. Each story becomes a
`JobDefinition`:

```ts
type JobDefinition = {
  id: 'JS-01';
  category: 'self' | 'understand' | 'plan' | 'children';
  titleKey: string;
  requires: { profiles: number; transits?: boolean; period?: boolean; question?: boolean };
  skillId: string;
  outputTemplate: string;
  starters: string[];
  phase: 1 | 2 | 3 | 4;
};
```

The hub UI and the server's context requirements both read the catalog. Adding a story is content
work plus one record.

## 2. Domain model

```ts
type BirthData = {
  localDate: string;
  localTime?: string;
  timeConfidence: 'exact' | 'approx' | 'unknown';
  placeLabel: string;
  lat: number;
  lon: number;
  timezone: string;
};

type ChartFacts = {
  bodies: BodyPlacement[];
  angles?: { ascendant: Placement; midheaven: Placement };
  houses?: HouseCusp[];
  aspects: Aspect[];
  patterns: Pattern[];
  meta: { engineVersion: string; optionsVersion: string; computedAt: string };
};
```

Pipeline (provided by `caelus` and `caelus-birth`):

```
BirthData
  -> IANA timezone resolution (historical DST, including Russia 2011/2014 changes)
  -> UT instant
  -> geocentric ecliptic longitudes and speeds
  -> ASC/MC and house cusps (Placidus)
  -> signs, degrees, house placements, aspects, patterns
```

Degradation rules:

- Unknown birth time: whole-sign houses, no ASC/MC or house claims, explicit UI note, no silent
  fabrication. House-sensitive conclusions are withheld.
- High latitude: Placidus is undefined; fall back to whole-sign or equal houses.
- Engine failure: report calculations unavailable; never invent positions.

Options (`houseSystem`, zodiac, orbs) are versioned with the facts so a configuration change
invalidates cached data deterministically.

### Interpretation knowledge base

The model's latent astrology knowledge is never the source of a claim. A versioned knowledge base
of interpretation atoms is composed into a job-specific brief:

```ts
type InterpretationAtom = {
  key: string; // 'sun.in.leo', 'moon.in.4', 'sun.trine.moon', 'transit.saturn.square.sun'
  text: { ru: string; en: string };
  weight: number;
  tags: ('strength' | 'purpose' | 'karma' | 'timing' | 'money' | 'relationships')[];
};

composeBrief(facts: ChartFacts, jobId: string, kbVersion: string): InterpretationAtom[];
```

The LLM narrates over the brief using a methodology Skill that defines weighting, tone, structure,
and safety. Content lives in `packages/astrology/content/{ru,en}/*.json`, is editorially owned, and
is testable: every generated claim traces to a chart fact or a brief atom.

## 3. Architecture

```
client
  BirthDataWizard        profile capture, place autocomplete, time confidence
  AstroHub               job catalog cards grouped by category
  ChartCard              wheel and positions table rendered from chart JSON
  deep links             /c/new?spec=vera-astrologer&prompt=<starter>

packages/astrology              pure domain, no app dependencies, MIT
  computeChart(BirthData, ChartOptions): ChartFacts
  computeTransits(chart, from, to, opts): TransitEvent[]
  findWindows(chart, range, activity, opts): Window[]
  renderDigest(facts, budget): string
  composeBrief(facts, jobId, kbVersion): InterpretationAtom[]

packages/api/src/astrology      feature adapter, injected dependencies
  profile service, cache, context provider, routes, job catalog

packages/data-schemas           AstroProfile collection
packages/data-provider          shared payload schemas, astro types
configSchema                    astrology configuration section
```

The engine interface is deliberately small; the ephemeris library and cache stay behind it, so an
engine swap is one adapter and not a caller-visible change.

### Per-turn grounding

```
request(spec = vera-astrologer)
  -> requireJwtAuth, config
  -> load AstroProfile            (parallel with existing turn loads, cached)
  -> facts = cache(hash(birth + options + engineVersion)) ?? computeChart
  -> sharedRunContext += natal digest + today's transit digest
  -> model narrates over authoritative facts
  -> period jobs resolve their range from the conversation, then compute
```

Injection is one call from the existing run-context assembly at
`api/server/controllers/agents/client.js:2815` into a function in `packages/api/src/astrology`.
`/api` keeps wiring only: the controller calls the TypeScript module, which owns digest building,
caching, and failure handling.

Only requests whose effective spec or agent matches the configured astrology identity receive the
digest; other conversations are untouched.

Continuity (JS-26/27) needs no new store: conversations persist, memory carries ongoing themes, and
each turn receives a fresh timing digest.

### Data

```
AstroProfile {
  user: ObjectId (indexed), tenantId,
  label: string, relation: 'self' | 'partner' | 'child' | 'family' | 'other',
  isDefault: boolean,
  birth: encrypted payload,
  consent: { store: boolean; shareable: boolean },
  createdAt, updatedAt
}
```

- Unique `{ user, label, tenantId }`; one partial-unique default per user.
- Birth payload is encrypted at rest with the app crypto module, excluded from logs and public
  projections, and deleted with the user.
- All writes invalidate the auth user document cache where they touch the user document.

**Prerequisite:** the development and production droplets currently serve plain HTTP (see
[`../vera-docs/deployment.md`](../vera-docs/deployment.md)). TLS must land before any birth data is
stored; cleartext PII is a release blocker, not a follow-up.

### Configuration

New levers ship on `configSchema` (`packages/data-provider/src/config.ts`) with defaults that
preserve today's behavior:

```yaml
astrology:
  enabled: false
  houseSystem: placidus
  zodiac: tropical
  orbProfile: standard
  maxProfiles: 10
  defaultSpec: vera-astrologer
  geocoding:
    provider: photon
  jobs:
    self: true
    timing: true
```

`enabled: false` disables the hub, the wizard, and context injection. The flag reaches the client
through startup config the same way `insightsEnabled` does.

### Agent

A saved agent pinned from the model spec (`preset.agent_id`) gives the astrologer a stable identity
that users cannot edit. The agent carries the methodology Skill, artifacts enabled, and the
conversation starters. Seeding is an idempotent operational step, not a per-deploy migration.

## 4. User experience

- First login without a profile: three-step wizard (date, time with confidence, place
  autocomplete). Time may be marked unknown.
- Landing: chart card (Sun, Moon, Ascendant when known) and topic cards.
- Job card: opens a new chat with the job's starter prompt and correct context.
- Answer shape: short synthesis, then sections, then positions/aspects table, then concrete next
  steps. The wheel is rendered from computed facts; the model never draws it.
- Degraded states: unknown-time banner, engine-unavailable message, profile edit/delete.
- All visible strings localized through `useLocalize`; semantic theme roles; new client state in
  Jotai.

## 5. Non-functional

- Caching: facts keyed by `hash(birth + options + engineVersion)`; digests keyed by
  `(profileId, day, budget)`. Version in the key makes engine and option upgrades safe.
- Database: profile reads on the message path are parallel with existing loads and cached; no serial
  read added to the LCP path (`npm run lighthouse` checks the visible conversation).
- Cost: short digest for follow-ups and daily use, full digest for deep reports, per-job model tier.
- Tenancy: models use `applyTenantIsolation`; methods take and return plain objects.
- Ops: the engine is lazy-loaded to fit the 320 MB heap cap; metrics cover calculation latency,
  cache hit rate, engine version, and per-job usage.

## 6. Verification

### Ephemeris spike (gate before product code)

Ten reference charts including Russia DST eras (1985, 1991, 2011, 2014), Murmansk (polar latitude),
ambiguous and nonexistent local times, southern hemisphere, and a pre-1900 date. Compare against
Swiss Ephemeris reference output:

| Quantity                    | Tolerance       |
| --------------------------- | --------------- |
| Body longitudes             | <= 0.05 degrees |
| ASC/MC and house cusps      | <= 0.1 degrees  |
| Retrograde flags            | exact           |
| Timezone and DST resolution | exact           |

A failed gate falls back to a Swiss Ephemeris commercial license; the engine seam already isolates
the swap.

### Product tests

- Golden-fixture engine tests for every supported timezone edge case.
- Handler and route tests: validation `safeParse` returns 400, tenant scoping, auth required.
- Digest and brief snapshot tests; every MVP answer must trace placements to `ChartFacts`.
- End-to-end: onboarding, then a JS-01 answer; unknown-time degradation; engine failure.
- Acceptance per MVP job, for example JS-01 must contain an integral synthesis, a positions table,
  at least three strengths, and placements that match the computed facts exactly.

## 7. Risks

- `caelus` is young and single-maintainer: mitigated by the spike gate, pinned versions, golden
  fixtures, and the isolated engine seam.
- Interpretation content volume for Russian is the largest non-engineering cost.
- TLS/PII is an external prerequisite; Russian data-residency questions may affect hosting choices.
- Long structured answers depend on model quality through the configured OpenRouter endpoint.

## 8. Open questions

1. Data residency: must birth data for Russian users remain in Russia? Affects droplet and Atlas
   placement.
2. Geocoding provider for Russia and CIS places: offline GeoNames versus Photon or Nominatim.
3. Hub placement: dedicated sidebar item or landing integration.
4. Ownership and review cadence for interpretation content.

## 9. Next steps

1. Approve this document.
2. Run the ephemeris spike with the accuracy harness and reference fixtures.
3. On a passing gate, create an OpenSpec `astrology-core` change and implement Phase 1.
