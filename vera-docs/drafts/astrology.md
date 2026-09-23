# Astrology consultation — design

Status: draft. Scope: MVP foundation, four jobs, chat-first UI. Decisions: MIT TypeScript engine
(`caelus`) behind an accuracy gate; Western tropical zodiac with Placidus houses; computation
in-process; structured interpretation knowledge base (atoms) narrated by the LLM; chart context
delivered through a deployment plugin hook and MCP tools, with no upstream source edits and no
custom client screens.

Companion docs: a plain-language walkthrough with a full glossary is in
[`astrology-explained.md`](./astrology-explained.md) (English) and
[`astrology-explained.ru.md`](./astrology-explained.ru.md) (Russian); a system overview with Mermaid
architecture diagrams is in [`astrology-architecture.md`](./astrology-architecture.md) (Russian);
the agent prompt and methodology drafts are in [`astrology-prompts.md`](./astrology-prompts.md)
(Russian).

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
payments, and custom client screens (onboarding wizard, hub page, chart card).

The 29 stories are modeled as a **job catalog** — declarative data, not code. Each story becomes a
`JobDefinition`:

```ts
type JobDefinition = {
  id: 'JS-01';
  category: 'self' | 'understand' | 'plan' | 'children';
  titleKey: string;
  requires: { profiles: number; transits?: boolean; period?: boolean; question?: boolean };
  skillId: string;
  briefTags: string[];
  outputTemplate: string;
  acceptance: string;
  starters: string[];
  phase: 1 | 2 | 3 | 4;
};
```

The catalog is runtime data, not documentation. The agent reaches it through MCP tools:
`list_consultation_jobs(category)` renders the topic menu, `get_job(jobId)` returns the method,
required inputs, and the answer skeleton, and `get_brief(jobId)` selects atoms by the job's
`briefTags` and validates `requires` before the model writes anything. The methodology Skill points
at the catalog instead of duplicating the topic table; a future hub page reads the same records.
Adding a story is content work plus one record, and every catalog call is observable, so job demand
can be measured from tool logs.

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

- Unknown birth time: whole-sign houses, no ASC/MC or house claims, an explicit in-chat notice, no
  silent fabrication. House-sensitive conclusions are withheld.
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

Content lives in `packages/astrology/content/{ru,en}/*.json`, is editorially owned, and is testable:
every generated claim traces to a chart fact or a brief atom. `composeBrief` is a pure function of
the facts, the job id, and `kbVersion`.

**How the brief reaches the model** — two levels, to control tokens without losing grounding:

- The hook digest carries the facts plus an **accent** of the 3–5 highest-weight atoms, so every turn
  has a minimal interpretive frame even before the model asks for anything.
- The full brief is fetched **by tool**: the methodology Skill resolves the topic through the job
  catalog, the model calls `get_brief(jobId)`, and the REST API returns the atoms ranked by the job's
  `briefTags` after checking `requires` (period, second profile). The brief is cached by
  `(profileId, jobId, kbVersion)`.

## 3. Architecture

```
client                            native LibreChat shell, no custom screens
  chat                            conversation with the astrologer agent
  starters                        four category starters from the job catalog
  ask_user_question               structured input for birth data
  artifacts / ui://               wheel and reports from MCP results

plugin/vera-astrology             deployment plugin, installed by the operator
  plugin.json
  ai.librechat/hooks/hooks.json   UserPromptSubmit command hook
  hooks/run-context.mjs           calls the REST API, prints the digest
  mcp.json                        MCP server definition
  prompts/instructions.md         agent core instructions, seeded into the saved agent
  skills/astrologer/SKILL.md      methodology

packages/astrology                pure domain, no app dependencies, MIT
  computeChart(BirthData, ChartOptions): ChartFacts
  computeTransits(chart, from, to, opts): TransitEvent[]
  findWindows(chart, range, activity, opts): Window[]
  renderDigest(facts, budget): string
  composeBrief(facts, jobId, kbVersion): InterpretationAtom[]
  listJobs(category?) / getJob(jobId) job catalog access
  content/{ru,en}/*.json          interpretation atoms
  catalog/jobs.json               job definitions, runtime data

packages/astrology-mcp            MCP server forwarding tool calls to the REST API
  resolve_birth_place, save_birth_data, update_birth_data, delete_birth_data, list_birth_profiles
  list_consultation_jobs, get_job, get_brief
  get_natal_chart, get_transits, find_windows, get_synastry

packages/api/src/astrology        feature adapter, injected dependencies
  profile service, cache, REST API, job catalog

packages/data-schemas             AstroProfile collection
packages/data-provider            shared payload schemas, astro types
configSchema                      astrology configuration section
```

The engine interface is deliberately small; the ephemeris library, content, and cache stay behind
it, so an engine swap is one adapter and not a caller-visible change.

### Context delivery

The design does not edit `api/server/controllers/agents/client.js` or any other upstream source
file. Chart context reaches the prompt through two mechanisms that already exist upstream: a
deployment plugin hook that injects the digest on every turn, and MCP tools for data collection and
calculations the model requests.

```
request(spec = vera-astrologer)
  -> requireJwtAuth, config
  -> createRun registers the plugin UserPromptSubmit hook
  -> SDK fires the hook with session_id = conversationId, agent_id, prompt
  -> hooks/run-context.mjs posts to POST /api/astrology/context with the service token
  -> the REST API resolves the user from generation job metadata, loads AstroProfile,
     computes or reads facts, renders the natal digest, today's transits, and the atom accent
  -> the script prints the digest; the SDK applies it as additionalContext (system tail)
  -> model narrates over authoritative facts
  -> the model resolves the topic through the catalog (list_consultation_jobs / get_job),
     calls get_brief(jobId), then computes period data through tools
```

- **Hook.** `UserPromptSubmit` is an upstream Agent Plugins event, and a command handler's stdout
  becomes `additionalContext` (`packages/api/src/agents/hooks/executor.ts:28,604`). The script reads
  its payload from stdin and exits without output when `agent_id` is not the configured astrologer,
  so other chats are untouched. Execution requires `DEPLOYMENT_PLUGIN_HOOKS=true`.
- **REST API.** `/api/astrology/*` is the only data surface. In MVP the hook and the MCP server use
  a service token; the browser JWT mode (profile CRUD, chart JSON, catalog) is deferred until a hub
  or settings form exists. For the hook, `POST /api/astrology/context` resolves the user from the
  generation job metadata (`GenerationJobManager.getJob(session_id)?.metadata.userId`), which works
  for a brand-new conversation before its row exists, then falls back to the conversation owner, and
  returns the digest text or an empty body. It never throws into the chat.
- **Fail-open.** A missing token, a hook failure, a timeout, or an engine error means the turn
  proceeds without the digest; the model can still call `get_natal_chart`.
- **MCP.** `packages/astrology-mcp` exposes profile tools (`resolve_birth_place`, `save_birth_data`,
  `update_birth_data`, `delete_birth_data`, `list_birth_profiles`), catalog tools
  (`list_consultation_jobs`, `get_job`, `get_brief`), and calculation tools (`get_natal_chart`,
  `get_transits`, `find_windows`, `get_synastry`), and forwards each call to the REST API with the
  user id from the existing `{{LIBRECHAT_USER_ID}}` header placeholder
  (`packages/api/src/utils/env.ts:33-52`) and the service token. `get_brief(jobId)` validates the
  job's `requires` and returns a structured "need" instead of atoms when the period or the second
  profile is missing.
- **Write confirmation.** Profile writes happen only after the user explicitly confirms the resolved
  place, timezone, and local time echoed back by `resolve_birth_place`; third-party profiles require
  separate confirmation.
- **Agent identity.** The hook and the REST API match on the saved agent id configured as
  `astrology.agentId`; the model spec pins that agent through `preset.agent_id`.

Continuity (JS-26/27) needs no new store: conversations persist, memory carries ongoing themes, and
each turn receives a fresh timing digest.

### Agent prompt architecture

The consultation behavior is split across versioned, reviewable layers:

| Layer                | Location                                           | Owner           | Role                                                              |
| -------------------- | -------------------------------------------------- | --------------- | ----------------------------------------------------------------- |
| Core instructions    | `plugin/vera-astrology/prompts/instructions.md`    | team, PR review | role, data-collection algorithm, hard truth rules, format, safety |
| Methodology Skill    | `plugin/vera-astrology/skills/astrologer/SKILL.md` | content editor  | topic frameworks, transit method, tone, anti-patterns             |
| Job catalog          | `packages/astrology/catalog/jobs.json`             | team            | machine definitions for the agent menu and future hub             |
| Interpretation atoms | `packages/astrology/content/{ru,en}/*.json`        | content editor  | curated claims composed into the brief                            |

The core instructions and the Skill are seeded into the saved agent by an idempotent operational
step; the source of truth is the repository, so every change is a pull request. Drafts live in
[`astrology-prompts.md`](./astrology-prompts.md) until implementation moves them to the plugin paths.

### Job catalog integration

The catalog (`packages/astrology/catalog/jobs.json`) is the single source of truth for what the
system can consult on: topic, required inputs, answer skeleton, brief tags, acceptance criteria, and
phase. It is consumed at runtime, not just referenced by docs:

- `list_consultation_jobs(category?)` renders the topic menu from data; the Skill no longer
  duplicates the topic table.
- `get_job(jobId)` returns the method, `requires`, `briefTags`, and `outputTemplate`; `get_brief`
  uses the same record to select atoms and to refuse a brief when inputs are missing.
- Tool calls are logged, so per-job demand is measurable without extra analytics plumbing.
- A future hub page reads the same records; the catalog does not change when the UI arrives.

The methodology Skill keeps the _how_ (analysis order, transit rules, tone); the catalog keeps the
_what_ (topics and their contracts); the atoms keep the _words_.

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
  agentId: <saved astrologer agent id>
  geocoding:
    provider: photon
  jobs:
    self: true
    timing: true
```

`enabled: false` disables the agent wiring and context injection; without it no astrology hook or
tool is active. The flag reaches the client through startup config the same way `insightsEnabled`
does, even though MVP has no dedicated screens.

### Agent

A saved agent pinned from the model spec (`preset.agent_id`) gives the astrologer a stable identity
that users cannot edit and a stable id for the hook and REST gate. The agent carries the core
instructions, the methodology Skill, the four category starters, artifacts enabled, and the
astrology MCP server. Seeding is an idempotent operational step, not a per-deploy migration.

## 4. User experience

Chat-first: everything happens inside a normal LibreChat conversation with the astrologer agent.
There are no custom screens, modals, or pages in MVP.

- **First contact.** The user picks a category starter. Because no profile exists yet, the agent
  asks for birth data with one `ask_user_question` call: date, time (options "exact", "approx",
  "unknown", free-form allowed), and place.
- **Place resolution.** The agent calls `resolve_birth_place`; with several candidates it shows them
  and asks to clarify. It then echoes the resolved result — "Москва, Россия · 12.05.1990 · 14:30 ·
  Europe/Moscow (UTC+3)" — and calls `save_birth_data` only after an explicit confirmation.
- **Unknown time.** The agent states once that the Ascendant and houses are not computed and that
  the reading works from signs and aspects; no house or ASC claims follow.
- **Editing.** "Change my birth time to 14:35" is handled through `update_birth_data`; deletion and
  listing work the same way.
- **Answer shape.** Short synthesis, then themed sections, then a dates/aspects table when relevant,
  then two to five concrete steps. The chart wheel is returned as an MCP `ui://` resource; the model
  never draws it.
- **Degraded states.** No profile: the agent asks. Engine failure: the agent says calculations are
  unavailable. Unknown time: a one-time notice.
- **Localization.** The agent and Skill are Russian-first; the surrounding shell keeps LibreChat
  localization, and any strings added to prompts or tool results live in the same RU/EN content set.

## 5. Non-functional

- Caching: facts keyed by `hash(birth + options + engineVersion)`; digests keyed by
  `(profileId, day, budget)`; briefs keyed by `(profileId, jobId, kbVersion, catalogVersion)`.
  Version in the key makes engine, option, content, and catalog upgrades safe.
- Database: profile reads on the message path are parallel with existing loads and cached; no serial
  read added to the LCP path (`npm run lighthouse` checks the visible conversation).
- Cost: digest plus a 3–5 atom accent per turn, full brief only on `get_brief`, per-job model tier.
- Tenancy: models use `applyTenantIsolation`; methods take and return plain objects.
- Context delivery: the hook command runs per user prompt (one subprocess plus one loopback request,
  well under the 30 s default timeout) and is fail-open, so a delivery failure degrades to no digest
  rather than a failed turn.
- Packaging: the plugin ships with the repository checkout and is mounted into the API container;
  `DEPLOYMENT_PLUGIN_HOOKS=true` enables execution and the service token lives in the operator
  `.env`. The image and Compose changes are fork-owned (`Dockerfile.multi`, `deploy-compose.vera.yml`).
- Ops: the engine is lazy-loaded to fit the 320 MB heap cap; metrics cover calculation latency, cache
  hit rate, engine and knowledge-base versions, per-job usage, brief composition, and hook delivery
  failures.

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

### Job traceability

Each story maps to a runtime path, its inputs, and its acceptance test; the `acceptance` field in
the catalog is the test contract.

| Job   | Runtime path                                        | Inputs                        | Acceptance                                                                              |
| ----- | --------------------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------- |
| JS-01 | Skill "whole-person" → `get_job` → `get_brief`      | Profile                       | Integral synthesis, positions table, at least three strengths, facts match `ChartFacts` |
| JS-02 | Skill "strengths" → `get_job` → `get_brief`         | Profile                       | Resources → how to apply → blockers → steps                                             |
| JS-11 | Skill "current period" → `get_job` → `get_brief`    | Profile + transits to now     | Ending, active, and starting sections with dates                                        |
| JS-14 | Skill "specific question" → `get_job` → `get_brief` | Profile + transits + question | Clarifies context first, then chart view, risks, windows, steps                         |

Phases 2–4 extend the same table from the catalog; a story without a row is not shipped.

### Product tests

- Golden-fixture engine tests for every supported timezone edge case.
- Handler and route tests: validation `safeParse` returns 400, tenant scoping, auth required.
- Hook contract tests: the script emits the digest for the configured agent and nothing for other
  agents; the REST API rejects a missing or wrong service token.
- First-turn coverage: a brand-new conversation receives the digest before its conversation row
  exists, proving the job-metadata resolution.
- Fail-open: endpoint timeout or engine failure yields no digest and an otherwise normal turn.
- Data collection end-to-end: a profile-less conversation goes starter -> questions ->
  `resolve_birth_place` -> confirmation -> `save_birth_data` -> JS-01 answer; an unknown-time run
  omits ASC/MC and house claims; a declined confirmation saves nothing.
- Prompt and content tests: a snapshot of the assembled agent instructions and Skill; atom coverage
  (every supported planet/sign, planet/house, and aspect key has RU text); brief snapshots for
  golden charts.
- Catalog tests: the seeded catalog parses, every MVP job has `briefTags` and `acceptance`, and
  `get_brief` refuses a brief when `requires` is unmet.
- MCP tool tests: profile tools reject an unconfirmed or absent profile; catalog tools return the
  seeded jobs; `get_brief` returns ranked atoms and is cached by `kbVersion`.
- Digest and brief snapshot tests; every MVP answer must trace placements to `ChartFacts`.
- Acceptance per MVP job comes from the catalog's `acceptance` field and the traceability table;
  JS-01, for example, must contain an integral synthesis, a positions table, at least three
  strengths, and placements that match the computed facts exactly.

## 7. Risks

- `caelus` is young and single-maintainer: mitigated by the spike gate, pinned versions, golden
  fixtures, and the isolated engine seam.
- The Agent Plugins hook surface is upstream and experimental. The digest logic stays behind our own
  REST API and the hook stays a thin adapter, so a breaking upstream change costs a small plugin
  update; the fallback is a single call in the run-context assembly.
- Chat-based birth data entry can produce wrong timezones or ambiguous places: mitigated by
  `resolve_birth_place` candidates, an explicit confirmation echo before any write, and tests for
  declined and ambiguous paths.
- Twenty-nine jobs behind four starters are hard to discover: mitigated by an in-chat topic menu and
  a future hub when metrics show the need.
- Interpretation content volume for Russian is the largest non-engineering cost; atom coverage tests
  gate release.
- TLS/PII is an external prerequisite; Russian data-residency questions may affect hosting choices.
- Long structured answers depend on model quality through the configured OpenRouter endpoint.

## 8. Open questions

1. Data residency: must birth data for Russian users remain in Russia? Affects droplet and Atlas
   placement.
2. Geocoding provider for Russia and CIS places: offline GeoNames versus Photon or Nominatim.
3. When (and whether) to add a hub page and a settings form; trigger is usage data from the
   chat-first flow.
4. Ownership and review cadence for interpretation content.

## 9. Next steps

1. Approve this document.
2. Run the ephemeris spike with the accuracy harness and reference fixtures.
3. On a passing gate, create an OpenSpec `astrology-core` change and implement Phase 1, including
   the deployment plugin, the REST API, the agent prompt, and the MCP server skeleton.
