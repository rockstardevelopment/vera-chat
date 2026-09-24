## Why

The fork must ship an astrologer consultation agent: it decides whether a message is an astrological request, selects a method and techniques, collects the inputs those techniques need, and answers from computed chart facts — never from the model's own astrology calculations. LibreChat provides the chat, agent, and tool machinery but no astrology computation, so the fork needs a config-shipped agent persona plus a separate computation service exposed through MCP.

The behavior contract is the product requirements document (Google Docs, "Agents → Astrologer"): <https://docs.google.com/document/d/1FPWwErD2LrCurpZ1-wtL6PYRqXorZBSMKcVQzzGjNfY/edit?tab=t.ez58ri8rm3vb>. A point-in-time snapshot is kept at [`reference/requirements.md`](./reference/requirements.md); the instructions and method routing are written from it.

## What Changes

- Add a fork-owned MCP service (`packages/astrology-mcp`) over Streamable HTTP that owns birth profiles and chart computation, identifying the caller through LibreChat's `{{LIBRECHAT_USER_ID}}` header.
- Add a pure astrology engine (`packages/astrology`) behind a narrow seam using the MIT-licensed `caelus` library, gated by an accuracy check against Swiss Ephemeris reference charts before product code is written. The alternatives evaluated — `sweph`/Swiss Ephemeris (AGPL or commercial), `circular-natal-horoscope-js` (unmaintained, natal-only), and the Python `stellium` (AGPL) and `jyotishganit` (Vedic tradition) — are recorded with reasons in `design.md` (D5).
- Add an `AstroProfile` collection in `packages/data-schemas`: encrypted birth payload, labeled profiles, tenant scoping, and account-deletion cleanup.
- Ship the astrologer as a model spec in `librechat.yaml`: a compact core prompt, the MCP server pinned, `ask_user_question` enabled; the full behavior specification is advertised by the service as MCP server instructions.
- Configure the service through its deployment settings: a `houseSystem` choice, an aspect-`orbProfile`, a geocoding provider, and a per-user profile limit, with defaults documented in `vera-docs/astrology.md`. The app's config schema does not carry these: the service cannot read it, and the app never consumes them.
- Wire build and deployment without editing upstream build files: a fork-owned `Dockerfile.vera` (a copy of `Dockerfile.multi` plus the new stages, selected by the two fork-owned deploy workflows) and a sidecar service in `deploy-compose.vera.yml`, deployed to the development droplet only.
- First techniques: natal chart, transits, horary chart, and elective windows — one per method, so every routing path in the requirements is exercised.

Deferred, explicit non-goals of this change: synastry, composite, secondary progressions, and solar/lunar returns; interpretation atoms/briefs and a persisted chart-facts cache; REST endpoints and prompt-injection hooks; TLS; internationalization; expanded edge-case policy beyond the fallbacks the requirements state. Each deferred item needs its own future change; the list is mirrored in `vera-docs/astrology.md`.

## Capabilities

### New Capabilities

- `astrologer-agent`: the astrologer's behavior contract — message classification, category and goal, method and technique selection, input collection with fallbacks, interpretation constraints, answer and refusal contract, and how the persona is configured in LibreChat.
- `astrology-service`: the fork-owned computation service — MCP tool surface, deterministic chart computation and its accuracy gate, birth-profile storage (each user's encrypted birth date, time, and place kept as a per-user `AstroProfile` document) with encryption and deletion, place and timezone resolution, operator settings (house system, orb profile, geocoding provider, profile limit), and caller identification.

### Modified Capabilities

- `deployment`: the development droplet may run the fork-owned astrology sidecar alongside the API when the feature is deployed; the API-only default and the rest of the workflow behavior are otherwise unchanged.

## Impact

- New workspaces: `packages/astrology` (engine) and `packages/astrology-mcp` (service).
- `packages/data-schemas`: new `AstroProfile` schema, model, and methods, plus small registrations in `models/index.ts` and `methods/index.ts`.
- `api/server/controllers/UserController.js`: one cleanup call added to the account-deletion cascade. MongoDB has no cascade, and this hand-written list is the only path that deletes user-owned collections; without the call, a deleted account's birth profiles would remain in the database.
- Operator configuration (not a committed change: `librechat.yaml` is gitignored and lives on the droplet): `mcpServers.astrology`, `mcpSettings.allowedAddresses`, and the `vera-astrologer` model spec are added when the feature is deployed; the exact block is documented in `vera-docs/deployment.md`.
- `Dockerfile.vera`, `.github/workflows/deploy-*.yml` (the `file:` selection), and `deploy-compose.vera.yml`: build stages and the sidecar service, development droplet only. Upstream `Dockerfile.multi` is not edited.
- No client changes; `packages/api` behavior unchanged; no breaking changes. There is no runtime feature flag: the feature exists where its YAML entries and sidecar are deployed, so enabling or disabling it is a deployment step, not a switch.
- Documentation: add `vera-docs/astrology.md` and update the page table in `vera-docs/index.md`; update `vera-docs/deployment.md` for the sidecar service, its operator-owned settings, the `librechat.yaml` block, and the `Dockerfile.vera` choice; note the new upstream-file conflict hot spots in `vera-docs/fork-workflow.md`. The `vera-docs/drafts/` drafts (including their `index.md`) are removed by this change; the instructions are written fresh from the requirements document.
- Dependencies: `caelus` (MIT ephemeris/chart library), `@modelcontextprotocol/sdk`, a geocoding provider client, and an IANA timezone resolver. The geocoding provider and the timezone/DST resolver (candidates: `caelus-birth`, `luxon`/`moment-timezone`, or Node's ICU data) are deliberately chosen during implementation and recorded as open questions in `design.md`.
