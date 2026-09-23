## Why

The fork must ship an astrologer consultation agent: it decides whether a message is an astrological request, selects a method and techniques, collects the inputs those techniques need, and answers from computed chart facts — never from the model's own astrology calculations. LibreChat provides the chat, agent, and tool machinery but no astrology computation, so the fork needs a config-shipped agent persona plus a separate computation service exposed through MCP.

## What Changes

- Add a fork-owned MCP service (`packages/astrology-mcp`) over Streamable HTTP that owns birth profiles and chart computation, identifying the caller through LibreChat's `{{LIBRECHAT_USER_ID}}` header.
- Add a pure astrology engine (`packages/astrology`) behind a narrow seam using the MIT-licensed `caelus` library, gated by an accuracy check against Swiss Ephemeris reference charts before product code is written.
- Add an `AstroProfile` collection in `packages/data-schemas`: encrypted birth payload, labeled profiles, tenant scoping, and account-deletion cleanup.
- Ship the astrologer as a model spec in `librechat.yaml`: a compact core prompt, the MCP server pinned, `ask_user_question` enabled; the full behavior specification is advertised by the service as MCP server instructions.
- Add an `astrology` section to the operator config schema (`enabled` defaulting to `false`, house system, orb profile, geocoding provider, profile limit).
- Wire build and deployment: new `Dockerfile.multi` stages and a sidecar service in `deploy-compose.vera.yml`, deployed to the development droplet only.
- First techniques: natal chart, transits, horary chart, and elective windows — one per method, so every routing path in the requirements is exercised.

Deferred, explicit non-goals of this change: synastry, composite, secondary progressions, and solar/lunar returns; interpretation atoms/briefs and a persisted chart-facts cache; REST endpoints and prompt-injection hooks; TLS; internationalization; expanded edge-case policy beyond the fallbacks the requirements state.

## Capabilities

### New Capabilities

- `astrologer-agent`: the astrologer's behavior contract — message classification, category and goal, method and technique selection, input collection with fallbacks, interpretation constraints, answer and refusal contract, and how the persona is configured in LibreChat.
- `astrology-service`: the fork-owned computation service — MCP tool surface, deterministic chart computation and its accuracy gate, birth-profile storage with encryption and deletion, place and timezone resolution, configuration levers, and caller identification.

### Modified Capabilities

None. The `deployment` capability's workflow behavior is unchanged; the sidecar rides the existing image-and-compose path.

## Impact

- New workspaces: `packages/astrology` (engine) and `packages/astrology-mcp` (service).
- `packages/data-schemas`: new `AstroProfile` schema, model, and methods.
- `packages/data-provider`: `astrology` section in `configSchema`.
- `api/server/controllers/UserController.js`: one cleanup call added to the account-deletion cascade — the only upstream-file edit.
- `librechat.yaml`: `mcpServers.astrology`, `mcpSettings.allowedAddresses`, and the `vera-astrologer` model spec.
- `Dockerfile.multi` and `deploy-compose.vera.yml`: build stages and the sidecar service, development droplet only.
- No client changes; `packages/api` behavior unchanged; no breaking changes. The feature is inert until `astrology.enabled` is turned on.
- Documentation: add `vera-docs/astrology.md` and update the page table in `vera-docs/index.md`; update `vera-docs/deployment.md` for the sidecar service and its operator-owned settings. The `vera-docs/drafts/astrology*.md` drafts are superseded by this change; whether to remove them is a follow-up decision, not part of it.
- Dependencies: `caelus` (MIT ephemeris/chart library), `@modelcontextprotocol/sdk`, a geocoding provider client, and an IANA timezone resolver.
