# Astrology consultation — plain-language walkthrough

Companion to [`astrology.md`](./astrology.md), written for a developer who does not know astrology
or this part of the codebase. It defines every term the design uses.

## 1. Summary in one sentence

The app does **math about birth charts** with a specialized library, then hands the **exact computed
numbers** to the LLM as hidden context, and the LLM's only job is to **explain those numbers in
conversation**. The LLM never calculates anything astrological.

## 2. The astrology half — what the numbers actually are

**Natal chart.**
A snapshot of where the Sun, Moon and planets were in the sky at the exact moment and place you were
born. "Where" is measured as an angle along a circle called the **ecliptic** (the path the Sun
appears to travel over a year), divided into 12 signs of 30° each: 0° Aries, 30° Taurus, and so on up
to 360°. A chart is essentially a list like: Sun at 21° Taurus, Moon at 8° Pisces, Mars at 3° Leo…

**Ephemeris.**
An almanac that answers "where was each planet on 1990-05-12 at 14:30 UTC?". `caelus` is a TypeScript
library that contains such an almanac (as math formulas) plus the astrology-specific calculations on
top. **Swiss Ephemeris** is the industry-standard older version of the same thing, written in C; our
plan uses `caelus` instead because it is MIT-licensed (free to use in a closed product) while Swiss
Ephemeris is AGPL (you must either publish your source or buy a commercial license). That license
difference is the single reason for the engine choice.

**Tropical vs sidereal zodiac.**
Two conventions for where the 12 signs start. "Tropical" anchors 0° Aries to the spring equinox —
this is what Western astrology uses. "Sidereal" anchors to the fixed stars (Vedic astrology). We
picked **tropical** because the job stories use Western concepts (transits, Solar return,
self-realization).

**Houses, Ascendant (ASC), Midheaven (MC).**
While signs describe _what kind of energy_ a planet carries, **houses** are 12 sectors describing
_which area of life_ it lands in (money, home, relationships, career…). Houses depend on the **exact
birth time**, because they are based on which part of the sky was rising. The **Ascendant** is the
point rising on the eastern horizon at birth; the **Midheaven** is the highest point. Both change
roughly every 2 minutes, so an hour of error in birth time can move them a whole sign.

**House system.**
There are several formulas for drawing the 12 house boundaries. **Placidus** is the most common in
Western astrology and the one we default to. **Whole sign** is a simpler system where each sign is
exactly one house — it does not depend on birth time, which is why it is our fallback when the user
does not know their birth time. **High latitude** (Murmansk, Tromsø) breaks Placidus mathematically,
hence the fallback there too.

**Aspects and orbs.**
An **aspect** is a meaningful angle between two planets: 0° conjunction, 60° sextile, 90° square,
120° trine, 180° opposition. "Sun square Saturn" means they are about 90° apart and the combination
has an interpretation. An **orb** is the tolerance — we still call it a square if it is 90° ± 6°, for
example. Orbs are a design choice, so the design says they are versioned.

**Transits.**
Where planets are _right now_, compared to where they were at birth. "Saturn is currently square
your natal Sun" is a **transit**. This is the standard forecasting technique and the basis for JS-11
("current period"), JS-12 ("short forecast") and others. Without transits, an astrologer can only
describe personality; with them, they can talk about time.

**The unknown-time case.**
If the user does not know their birth time, we cannot compute the Ascendant or houses honestly. The
design says: use whole-sign houses, drop all Ascendant/house statements from the answer, and show a
visible notice. This is a product trust decision: a confident wrong Ascendant is worse than an
honest gap.

**Other astrology terms that appear in the design:**

- **Synastry** — comparing two people's charts for compatibility (JS-09/10).
- **Solar return** — the chart of the moment the Sun returns to its birth position each year; used
  for "your personal year" (JS-18).
- **Rectification** — reconstructing an unknown birth time from life events; explicitly out of MVP.
- **Election windows** ("выбор периода", JS-16) — scanning a date range for the best days for an
  action (signing a contract, a wedding).
- **Vedic/sidereal** — the Indian tradition; out of MVP.

## 3. The software half — how the pieces fit

**Monorepo / workspace.**
One git repository containing several npm packages. This repo has `api` (legacy server wiring),
`packages/api` (new backend code), `packages/data-schemas` (database), `packages/data-provider`
(types shared by frontend and backend), `client` (React app). The design adds one more:

**`packages/astrology` — the calculator.**
A new package containing pure functions. "Pure" means: data in, data out, no database, no HTTP, no
config, no knowledge that LibreChat exists. You call `computeChart(birthData, options)` and get back
`ChartFacts`. Because it is isolated, it is easy to test (compare to known-correct charts) and easy
to swap later for a different engine. This is what "the engine seam" means: there is exactly one
small doorway (`computeChart`, `computeTransits`, …) through which the rest of the app touches
astrology math, so replacing `caelus` with Swiss Ephemeris would only change what is behind the
door.

**`ChartFacts` — the computed result.**
A JSON object: every planet's sign, degree, house, whether it is retrograde, all aspects, and a
`meta` block recording which engine/option versions produced it. It is the single source of truth
for everything the user is told.

**The digest.**
An LLM cannot compute planet positions and should not guess them. A **digest** is a compact,
plain-text summary of `ChartFacts` (e.g. a table of placements plus the aspects that matter) plus
today's transits. It is inserted into the model's instructions on every turn. Budgets ("short" vs
"full" digest) control how much of it goes in, because instructions cost tokens/money.

**`sharedRunContext` — where the digest is injected.**
LibreChat already has a mechanism for adding run-specific text to the model's system instructions
(it is used today for file contents and user memories). In code it is assembled in
`api/server/controllers/agents/client.js` around line 2815. Our design adds one call there: "ask
`packages/api/src/astrology` for the digest text and append it". The controller stays dumb; the
astrology logic stays in TypeScript under `packages/api`. That is what "`/api` holds wiring, not
behavior" means in this repo.

**`packages/api/src/astrology` — the feature adapter.**
The layer that knows about users, the database, config and caching: load the user's profile, compute
or fetch cached facts, build the digest, expose HTTP routes (`/api/astrology/profiles`, `/chart`,
`/transits`). "Adapter" here means it adapts the pure calculator to this specific app.

**`AstroProfile` — the stored birth data.**
A MongoDB record per person whose chart we know: who it belongs to (`user`), their label ("Я",
"Мама"), relationship type, the birth date/time/place/timezone, a confidence flag, and consent
flags. One is marked default. **ObjectId** is MongoDB's ID type; **tenantId** is the fork's
multi-tenancy stamp (the app may serve multiple organizations, and queries are automatically scoped
so tenant A never sees tenant B's data). **Encryption at rest** means the birth payload is stored
encrypted so a database dump does not expose it. **PII** means personally identifiable information —
birth date+time+place is exactly that.

**TLS.**
The droplets currently serve plain HTTP, so anything sent to the server (including birth data)
travels readable across the network. The design flags this as a hard prerequisite: no birth data
until HTTPS/Cloudflare Tunnel lands.

**`configSchema` / `librechat.yaml`.**
Operators configure LibreChat through a YAML file validated against a schema. Repo rules say every
new switch must live there with a safe default, so the design adds an `astrology:` section where
`enabled: false` means the whole feature is invisible until an operator turns it on.
`insightsEnabled` is the existing example of how such a flag reaches the frontend.

**Agent and model spec.**
In LibreChat, an **agent** is a configured assistant (instructions, tools, model). A **model spec**
is an entry in the model dropdown, defined in YAML, that can carry a preset — including
`preset.agent_id`, which pins a specific saved agent. We use that so "Vera the astrologer" is a
stable, non-editable persona users select, and so the server can recognize astrology conversations
("effective spec is `vera-astrologer`") and only then inject the digest.

**Skill.**
A LibreChat feature: a markdown instruction document the model can load on demand. We use it for the
astrologer's _methodology_ — tone, how to weigh placements, how to structure an answer, safety
rules. Content, not code, so editors can change it without a deploy.

**Interpretation knowledge base and atoms.**
This is the quality engine. Instead of trusting the model's memory of astrology ("Sun in Leo
means…"), we keep a curated library of small text snippets — **atoms** — keyed by chart combination
(`sun.in.leo`, `moon.in.4`, `sun.trine.moon`). `composeBrief(facts, jobId)` selects and ranks the
atoms relevant to the current job and produces a **brief**; the model then writes fluent prose over
that brief. Benefits: consistent answers, editorial control, easy Russian/English localization, and
claims can be traced and tested. This is also the biggest content cost, which the design calls out.

**The job catalog.**
The 29 job stories are stored as data records (`JobDefinition`: which profile/transits/period/
question it needs, its starter prompt, its category, its phase). The hub page renders cards from
this data; the server consults it to know what context to prepare. Adding a new story should not
require writing code in multiple places — that is the scalability argument of the design.

**Caching and the hash key.**
Computing a chart is fast, but doing it on every message is wasteful. The design stores results keyed
by a **hash** (fingerprint) of the birth data + options + engine version. "Version in the key"
means: upgrade the engine, and old cached results are automatically ignored rather than silently
mixed with new ones.

**Golden fixtures, spike, e2e, Lighthouse.**

- **Spike** — a short time-boxed experiment to de-risk a decision. Here: verify `caelus` against ten
  known reference charts before building anything.
- **Golden fixtures** — saved pairs of input and known-correct output used as regression tests
  forever after.
- **e2e** — a test that drives the real UI (onboarding, asking a question).
- **Lighthouse** — a performance measurement; the repo runs it in CI and charges extra for each
  database query on the visible page, which is why the design says the profile read must not add a
  serial query to the first paint (LCP = Largest Contentful Paint, when the main content becomes
  visible).

## 4. End-to-end: what actually happens (concrete example)

Anna opens the app for the first time.

1. The client finds no `AstroProfile` for her and shows the **wizard**: date of birth, time (or "I
   don't know"), and a place field with autocomplete.
2. She submits "12.05.1990, 14:30, Москва". The server resolves "Москва" to coordinates and an
   **IANA timezone** (the standard timezone database, e.g. `Europe/Moscow`) and converts local time
   to a precise UTC instant, applying the historical DST rules that were in force in 1990 — Russia
   changed its rules several times, including 2011 and 2014, and a naive fixed offset would produce
   a wrong chart. The profile is saved encrypted.
3. On the landing page she sees a chart card and a **job catalog** of topic cards. She taps "Понять
   себя" (JS-01).
4. That opens a new chat with a **deep link** that carries the astrology model spec and a starter
   question.
5. When she sends the message, the server:
   - authenticates her (existing `requireJwtAuth`),
   - sees the conversation uses the astrology spec, so it loads her default profile (in parallel
     with the other database reads it already performs, and cached),
   - computes `ChartFacts` with the calculator (or reads it from cache),
   - renders the digest of her natal placements and a second digest of today's **transits**,
   - appends both to `sharedRunContext`.
6. The model now receives: the astrologer agent instructions, the methodology Skill, the exact chart
   facts, today's transits, and her question. It writes the interpretation. It cannot invent a
   placement, because the real numbers are in front of it — and if it claims something, the claim
   traces back to an atom in the brief.
7. The client renders the answer, and renders the **chart wheel** as a React SVG component directly
   from the chart JSON — not from anything the model wrote.
8. Next month she returns with a new question. The same conversation persists, memory carries her
   themes, and the server recomputes only the _today_ digest; the natal half comes from cache. That
   is JS-26 continuity with no new storage.

## 5. Glossary (compact)

| Term                   | Meaning                                                              |
| ---------------------- | -------------------------------------------------------------------- |
| Natal chart            | Sky snapshot at birth; positions of planets in signs/houses          |
| Ecliptic               | 360° circle on which celestial positions are measured                |
| Ephemeris              | Almanac/math that computes celestial positions for any date          |
| `caelus`               | MIT TypeScript ephemeris + chart library we plan to use              |
| Swiss Ephemeris        | Industry-standard C library; AGPL or paid commercial license         |
| Tropical / sidereal    | Two zodiac conventions; we chose tropical (Western)                  |
| House                  | One of 12 life-area sectors; needs birth time                        |
| ASC / MC               | Ascendant / Midheaven; time-sensitive chart points                   |
| Placidus / whole sign  | House systems; Placidus default, whole sign for unknown time         |
| Aspect / orb           | Meaningful angle between planets / its tolerance                     |
| Transit                | Current sky relative to the natal chart; basis of forecasts          |
| Synastry               | Comparing two charts for compatibility                               |
| Solar return           | Annual chart for the Sun's return to its birth position              |
| `ChartFacts`           | The computed JSON result; source of truth                            |
| Digest                 | Compact text rendering of facts injected into the model prompt       |
| Atom / brief           | Curated interpretation snippet / selected set for a job              |
| Skill                  | LibreChat markdown instructions loaded by the model                  |
| Agent / model spec     | Configured assistant / selectable preset entry pointing at it        |
| `sharedRunContext`     | Existing LibreChat channel for per-run extra system context          |
| Adapter / seam         | Concrete implementation behind a small interface / where it plugs in |
| Pure package           | Code with no app/DB/HTTP dependencies; easy to test and swap         |
| `AstroProfile`         | Stored birth data record per person                                  |
| Tenant                 | Organization isolation stamp on every record                         |
| PII / TLS              | Personal data / encrypted transport; TLS is a prerequisite           |
| Hash / cache key       | Fingerprint used to store and reuse computed results                 |
| Spike                  | Time-boxed experiment to answer a risky question (engine accuracy)   |
| Golden fixture         | Saved known-correct input/output pair used in tests                  |
| e2e / LCP / Lighthouse | UI-level test / first content paint / performance CI check           |

## 6. What each section of the design was trying to say

| Design section    | Plain meaning                                                                       |
| ----------------- | ----------------------------------------------------------------------------------- |
| §1 Scope          | Which four stories we build first; the rest is a data-driven catalog                |
| §2 Domain model   | The exact shape of inputs, computed facts, and the interpretation atoms             |
| §3 Architecture   | Which package does what; how the digest reaches the prompt; database, config, agent |
| §4 UX             | Wizard, hub, chart card, answer shape, degraded states                              |
| §5 Non-functional | Caching, no slow queries on first paint, cost control, tenancy, memory limits       |
| §6 Verification   | Prove the engine is accurate before building; then unit/route/e2e tests             |
| §7 Risks          | Young library, Russian content volume, TLS/PII, model quality                       |
| §8 Open questions | Residency, geocoding provider, hub placement, content ownership                     |
| §9 Next steps     | Approve, run the spike, then formalize as an OpenSpec change                        |

## 7. How this document relates to the design

The design ([`astrology.md`](./astrology.md)) is the contract: decisions, interfaces, data shapes,
verification. This walkthrough is the explanation of that contract; if the two disagree, the design
wins. The glossary in §5 is the quick reference for any term used in either document.
