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
(types shared by frontend and backend), `client` (React app). The design adds the calculator
package, an MCP server, and a deployment plugin.

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

**How facts and briefs reach the model: a hook plus MCP tools.**
The design does not modify any upstream LibreChat source file. It uses two extension points that
already exist:

- **Deployment plugin hook.** A **deployment plugin** is an operator-installed bundle that LibreChat
  loads at startup (manifest, optional MCP server, skills, hooks). A **hook** is a small script the
  server runs at a named moment in a run. The `UserPromptSubmit` hook runs when the user's message is
  submitted, and whatever the script prints to stdout is added to the model's system context as
  `additionalContext`. Our script asks our own REST API for the digest and prints it. It stays silent
  for conversations that are not the astrologer's, and it is **fail-open**: if anything goes wrong,
  the turn continues without the digest.
- **REST API.** `/api/astrology/*` is one HTTP surface. In the MVP the hook and the MCP server use a
  service token; the browser JWT mode (profile form, chart card, catalog) is deferred until a hub or
  settings form exists. The hook calls `POST /api/astrology/context`; the API learns who is asking
  from the generation job record (which exists even before a brand-new conversation is stored in the
  database), loads the profile, computes the facts, and returns the digest text.
- **MCP tool.** **MCP (Model Context Protocol)** is LibreChat's standard way to give a model tools.
  `packages/astrology-mcp` exposes profile tools (`resolve_birth_place`, `save_birth_data`, …),
  calculation tools (`get_transits`, `find_windows`, …), and `get_brief`, so the model can collect
  data and ask for extra calculations mid-conversation. Each tool call is forwarded to the same REST
  API; the server learns who the user is from the `{{LIBRECHAT_USER_ID}}` placeholder in its
  configuration.

Why not just put the chart into the agent instructions? Because agent instructions are **static and
shared by every user**; a chart is personal and its timing half changes daily, so it must arrive per
turn.

**`packages/api/src/astrology` — the feature adapter.**
The layer that knows about users, the database, config and caching: load the user's profile, compute
or fetch cached facts, build the digest, and expose the REST surface (`/api/astrology/profiles`,
`/chart`, `/context`, `/transits`, `/windows`). "Adapter" here means it adapts the pure calculator to
this specific app.

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
stable, non-editable persona users select, and so the hook and the REST API can recognize astrology
conversations by that stable agent id and only then inject the digest.

**Agent instructions and methodology.**
The behaviour of the astrologer is two versioned repository files seeded into the saved agent. The
**core instructions** hold the role, the birth-data collection algorithm, the hard truth rules, the
answer format, and safety. The **methodology Skill** holds the topic frameworks (JS-01/02/11/14),
the order of chart analysis, and the transit method. Both change only through a pull request.

**Skill.**
A LibreChat feature: a markdown instruction document the model can load on demand. We use it for the
astrologer's _methodology_ — tone, how to weigh placements, how to structure an answer, safety
rules. Content, not code, so editors can change it without a deploy.

**Interpretation knowledge base and atoms.**
This is the quality engine. Instead of trusting the model's memory of astrology ("Sun in Leo
means…"), we keep a curated library of small text snippets — **atoms** — keyed by chart combination
(`sun.in.leo`, `moon.in.4`, `sun.trine.moon`). `composeBrief(facts, jobId)` selects and ranks the
atoms relevant to the current job and produces a **brief**; the model then writes fluent prose over
that brief. The brief reaches the model in two parts: the hook digest carries a 3–5 atom **accent**,
and the full brief is fetched by the `get_brief(jobId)` tool once the model has picked the topic.
Benefits: consistent answers, editorial control, easy Russian/English localization, and claims can
be traced and tested. This is also the biggest content cost, which the design calls out.

**The job catalog.**
The 29 job stories are stored as data records (`JobDefinition`: which profile/transits/period/
question it needs, its brief tags, its answer skeleton, its acceptance criteria, its phase). The
catalog is not just documentation: the agent reads it through tools. `list_consultation_jobs` renders
the topic menu, `get_job(jobId)` returns the method and the required inputs, and `get_brief(jobId)`
refuses to hand over atoms when those inputs are missing — so a story's requirements are enforced at
runtime. Four category starters remain the entry point; a hub page would read the same records
later. Adding a story is content work plus one record, and catalog tool calls double as usage
analytics.

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
- **e2e** — a test that drives the real conversation flow (first contact, data collection, a question).
- **Lighthouse** — a performance measurement; the repo runs it in CI and charges extra for each
  database query on the visible page, which is why the design says the profile read must not add a
  serial query to the first paint (LCP = Largest Contentful Paint, when the main content becomes
  visible).

## 4. End-to-end: what actually happens (concrete example)

Anna opens the app for the first time.

1. She selects the astrologer agent and taps the **"Понять себя"** starter. There are four category
   starters; a future hub would show more cards but MVP has none.
2. Because no `AstroProfile` exists for her, the agent asks for birth data with one
   **`ask_user_question`** call: date, time (with "I don't know" as an option), and place.
3. She answers "12.05.1990, 14:30, Москва". The agent calls **`resolve_birth_place`**: the server
   resolves "Москва" to coordinates and an **IANA timezone** (the standard timezone database, e.g.
   `Europe/Moscow`) and converts local time to a precise UTC instant, applying the historical DST
   rules that were in force in 1990 — Russia changed its rules several times, including 2011 and
   2014, and a naive fixed offset would produce a wrong chart.
4. The agent echoes the result — "Москва, Россия · 12.05.1990 · 14:30 · Europe/Moscow (UTC+3)" — and
   calls **`save_birth_data`** only after her explicit "yes". The profile is stored encrypted.
5. On her next message, the server injects context:
   - the run registers the plugin's `UserPromptSubmit` hook; the hook script calls the REST API
     (`POST /api/astrology/context`) with the conversation id,
   - the API finds her in the generation job record, loads her default profile, computes
     `ChartFacts` with the calculator (or reads it from cache), and returns the natal digest,
     today's **transits**, and the 3–5 atom **accent**,
   - the script prints it, and the model receives it as system context (`additionalContext`).
6. The agent picks the job (JS-01): it calls **`get_job('JS-01')`** for the method and requirements,
   then **`get_brief('JS-01')`** and receives the ranked atoms for that topic. It now has the
   astrologer instructions, the methodology Skill, the exact chart facts, the accent, and the brief.
   It writes the interpretation. It cannot invent a placement, because the real numbers are in front
   of it — and if it claims something, the claim traces back to an atom in the brief.
7. The answer appears in the chat; the **chart wheel** comes back as an MCP `ui://` resource rendered
   from the same computed facts — not from anything the model wrote.
8. Next month she returns with a new question. The same conversation persists, memory carries her
   themes, and the server recomputes only the _today_ digest and the brief for the new topic; the
   natal half comes from cache. That is JS-26 continuity with no new storage.

## 5. Glossary (compact)

| Term                     | Meaning                                                                             |
| ------------------------ | ----------------------------------------------------------------------------------- |
| Natal chart              | Sky snapshot at birth; positions of planets in signs/houses                         |
| Ecliptic                 | 360° circle on which celestial positions are measured                               |
| Ephemeris                | Almanac/math that computes celestial positions for any date                         |
| `caelus`                 | MIT TypeScript ephemeris + chart library we plan to use                             |
| Swiss Ephemeris          | Industry-standard C library; AGPL or paid commercial license                        |
| Tropical / sidereal      | Two zodiac conventions; we chose tropical (Western)                                 |
| House                    | One of 12 life-area sectors; needs birth time                                       |
| ASC / MC                 | Ascendant / Midheaven; time-sensitive chart points                                  |
| Placidus / whole sign    | House systems; Placidus default, whole sign for unknown time                        |
| Aspect / orb             | Meaningful angle between planets / its tolerance                                    |
| Transit                  | Current sky relative to the natal chart; basis of forecasts                         |
| Synastry                 | Comparing two charts for compatibility                                              |
| Solar return             | Annual chart for the Sun's return to its birth position                             |
| `ChartFacts`             | The computed JSON result; source of truth                                           |
| Digest                   | Compact text rendering of facts injected into the model prompt                      |
| Atom / brief             | Curated interpretation snippet / selected set for a job                             |
| `ask_user_question`      | LibreChat tool that pauses the run to ask the user structured questions             |
| `resolve_birth_place`    | Tool that turns a place name into candidates, coordinates, and an IANA timezone     |
| `list_consultation_jobs` | Tool that lists catalog topics, so the menu comes from data                         |
| `get_job`                | Tool that returns a job's method, required inputs, and answer skeleton              |
| `get_brief`              | Tool that returns the ranked atoms for a job, after checking its requirements       |
| `ui://`                  | MCP resource rendered in the chat as an interactive widget (for example the wheel)  |
| Skill                    | LibreChat markdown instructions loaded by the model                                 |
| Agent / model spec       | Configured assistant / selectable preset entry pointing at it                       |
| Deployment plugin        | Operator-installed bundle LibreChat loads at startup (manifest, MCP, skills, hooks) |
| Hook / additionalContext | Script run at a named moment in a run / text it adds to the model's system context  |
| MCP tool                 | Standard LibreChat way to give a model callable tools                               |
| REST API / service token | One HTTP surface: hook and MCP use a service token; browser JWT mode deferred       |
| Fail-open                | A delivery failure yields no digest instead of a failed turn                        |
| Adapter / seam           | Concrete implementation behind a small interface / where it plugs in                |
| Pure package             | Code with no app/DB/HTTP dependencies; easy to test and swap                        |
| `AstroProfile`           | Stored birth data record per person                                                 |
| Tenant                   | Organization isolation stamp on every record                                        |
| PII / TLS                | Personal data / encrypted transport; TLS is a prerequisite                          |
| Hash / cache key         | Fingerprint used to store and reuse computed results                                |
| Spike                    | Time-boxed experiment to answer a risky question (engine accuracy)                  |
| Golden fixture           | Saved known-correct input/output pair used in tests                                 |
| e2e / LCP / Lighthouse   | UI-level test / first content paint / performance CI check                          |

## 6. What each section of the design was trying to say

| Design section    | Plain meaning                                                                                   |
| ----------------- | ----------------------------------------------------------------------------------------------- |
| §1 Scope          | Which four stories we build first; the rest is a data-driven catalog                            |
| §2 Domain model   | The exact shape of inputs, computed facts, and the interpretation atoms                         |
| §3 Architecture   | Which package does what; how the hook and MCP deliver facts and briefs; database, config, agent |
| §4 UX             | Chat-first: starters, birth-data collection, answer shape, degraded states                      |
| §5 Non-functional | Caching, no slow queries on first paint, cost control, tenancy, memory limits                   |
| §6 Verification   | Prove the engine is accurate before building; then unit/route/e2e tests                         |
| §7 Risks          | Young library, experimental upstream hook, Russian content volume, TLS/PII, model quality       |
| §8 Open questions | Residency, geocoding provider, hub timing, content ownership                                    |
| §9 Next steps     | Approve, run the spike, then formalize as an OpenSpec change                                    |

## 7. How this document relates to the design

The design ([`astrology.md`](./astrology.md)) is the contract: decisions, interfaces, data shapes,
verification. This walkthrough is the explanation of that contract; if the two disagree, the design
wins. The glossary in §5 is the quick reference for any term used in either document.
