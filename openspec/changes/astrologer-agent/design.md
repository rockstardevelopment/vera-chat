## Context

See `proposal.md` for motivation and `specs/` for the behavior contracts.

The fork is a LibreChat 0.8.x monorepo: `/api` holds Express wiring, `/packages/api`, `/packages/data-schemas`, `/packages/data-provider` hold backend TypeScript, `/client` the SPA, and workspaces are `api`, `client`, `packages/*`. Relevant upstream surfaces this design builds on:

- **Model specs** (`modelSpecs` in `librechat.yaml`): a spec can create an ephemeral agent with private server-applied `preset.promptPrefix`, pin MCP servers via `mcpServers`, and enable `askUserQuestion`. Private preset fields are stripped from client config (`packages/api/src/modelSpecs/index.ts`).
- **MCP**: YAML-defined servers with Streamable HTTP, per-user identity through `{{LIBRECHAT_USER_ID}}` headers, and `serverInstructions: true`, which appends the server's advertised `instructions` to the agent's system prompt (`packages/api/src/agents/context.ts`, `MCPServerInspector`). Tool results are text (no `structuredContent`).
- **HITL**: `ask_user_question` is a default agent capability with durable Mongo checkpointing.
- **Deployment**: image built from `Dockerfile.multi` target `api-build`; `deploy-compose.vera.yml` overlays upstream compose; droplets are 512 MB, Mongo Atlas holds the database, and both environments run plain HTTP (`vera-docs/deployment.md`). The committed `librechat.yaml` defines an OpenRouter custom endpoint defaulting to `deepseek/deepseek-v4.1-flash`.

The requirements document is the behavior contract for the agent; the deferred drafts in `vera-docs/drafts/` describe a larger architecture this change intentionally does not build.

## Goals / Non-Goals

**Goals:**

- One config-shipped, user-uneditable astrologer persona, with prompt text in reviewable repository files rather than inline YAML.
- A deterministic computation boundary that the model cannot bypass or fabricate around.
- Birth profiles stored with the app's own database, encryption, and deletion semantics.
- Minimal upstream footprint: new packages plus one call in the account-deletion cascade.

**Non-Goals:**

- Saved Agent, Agent API, versioning, or ACL exposure (migration path documented under Decisions).
- Interpretation atoms/briefs, persisted chart-facts caching, REST endpoints, prompt-injection hooks, custom client screens.
- Synastry, composite, progressions, returns, TLS, and i18n.

## Decisions

**D1. Ephemeral model-spec agent now, saved-agent migration path later.**
The persona is a `modelSpecs` entry: private `promptPrefix`, pinned MCP server, `askUserQuestion: true`, conversation starters, label/description. No database seeding, no drift, no operational step, and instructions stay invisible to users. Alternative: a saved Agent pinned via `preset.agent_id` — deferred because it needs a seeding mechanism (Management API with an OIDC machine client, which this deployment does not have, or manual creation) and introduces repo/DB drift. Migration, if Agent API access or versioning is later wanted: same spec gains `preset.agent_id`; `promptPrefix` moves into agent instructions, spec flags map to agent tools. Existing ephemeral conversations do not retroactively gain the saved agent's persona.

**D2. MCP is the only tool surface.**
Alternatives rejected: OpenAPI Actions do not substitute `{{LIBRECHAT_USER_ID}}` (verified: the placeholder is resolved only in the MCP layer), so per-user profiles are unreachable; built-in tools in `api/app/clients/tools` require upstream source edits and are not a documented extension point. MCP is the documented first-class path and provides identity headers, `serverInstructions`, and dynamic catalogs.

**D3. One sidecar process over Streamable HTTP.**
The docs recommend Streamable HTTP for production; the service runs as a second compose service from the same image, on the compose-internal network with no published port. STDIO is rejected for production (single-user semantics, no header placeholders) but the server is written against the SDK's transport-agnostic server so a local STDIO mode remains available for development.

**D4. Prompt layers: compact core in `promptPrefix`, full behavior spec as MCP server instructions.**
The compact core (identity, language policy, hard truth rules, routing summary, current date/time variables) stays in `librechat.yaml`. The full stage 1–8 specification lives in `packages/astrology-mcp/content/instructions.md` and is advertised by the server, landing in the same system prompt. This keeps YAML small, keeps the text out of any user-visible surface, and versions the prompt with the engine. Alternatives rejected: inline `promptPrefix` (bloats YAML), deployment skills (read-only but user-visible in the Skills panel, and injected as messages), saved-agent instructions (requires seeding). Constraint discovered: `{{current_date}}`-style variables are substituted before MCP instructions are appended, so date/time variables must stay in `promptPrefix`.

**D5. Engine behind a narrow seam, `caelus` first.**
`packages/astrology` exposes pure functions over plain data (`computeChart`, `computeTransits`, `computeHorary`, `findElectiveWindows`) with options and versions in the result metadata. The MIT `caelus` library sits behind this seam. An accuracy spike against Swiss Ephemeris reference fixtures gates product code; a failed gate falls back to a commercial Swiss Ephemeris license behind the same seam. Alternatives rejected: Python + `pyswisseph` or `sweph` bindings (AGPL/commercial licensing, a second toolchain in the image).

**D6. Profiles live in the app's Mongo through `packages/data-schemas`.**
New `AstroProfile` schema/model/methods: labeled profiles, birth payload encrypted with the app crypto module, `applyTenantIsolation`, and a `deleteAstroProfiles` call added to the existing account-deletion cascade in `api/server/controllers/UserController.js`. Alternative rejected: service-owned storage (second datastore with its own backup, retention, and deletion story).

**D7. Caller identity via the MCP user header.**
`X-User-Id: {{LIBRECHAT_USER_ID}}` plus a shared service-token header on a compose-internal, unpublished service. Missing or untrusted identity is rejected. The service resolves tenant/user scope from the id alone; a browser JWT mode and a public REST surface are out of scope.

**D8. Method and technique mapping stays in the prompt for this change.**
The mapping tables of requirements sections 3–4 are prompt text. A data-driven method catalog (an additional MCP tool) is deferred; it is additive and does not change existing tools.

**D9. Caching is in-process and version-keyed.**
The service reuses computed results for identical inputs and options within its process, keyed by a hash of inputs, options, and engine version; a persisted cache is deferred until metrics or multi-replica demand. Configuration levers (`enabled` default `false`, house system, orb profile, geocoding provider, profile limit) are added to `configSchema` with behavior-preserving defaults.

**D10. Deployment wiring is fork-owned and development-only.**
`Dockerfile.multi` gains package.json copies, build stages (engine, then service), and dist copies; `deploy-compose.vera.yml` gains the sidecar service on the same image with a healthcheck and `MONGO_URI`/token environment. `librechat.yaml` gains `mcpServers.astrology` (`chatMenu: false`, `serverInstructions: true`), `mcpSettings.allowedAddresses`, and the model spec. TLS is deferred; the feature is dev-only and must not receive real users' birth data until a TLS change lands.

**D11. Unknown birth time follows the requirement: noon chart with explicit limits.**
Compute at 12:00 local and mark house-dependent facts unreliable; the prompt forbids Ascendant and house claims. The drafts' whole-sign/no-ASC variant is not adopted because the requirement names the noon chart; the honesty guarantee is preserved by the flag plus prompt rules.

**D12. Model choice follows a prompt evaluation.**
The spec's `preset.model` is pinned after evaluating two or three OpenRouter candidates with the real instructions, tool flow, and the requirements' example matrices. The evaluation covers classification, method routing, tool discipline, and answer shape, and weighs cost per consultation.

## Risks / Trade-offs

- [`caelus` is young and single-maintainer, ~50 MB unpacked] → pinned version, accuracy spike with golden fixtures, narrow seam, documented Swiss Ephemeris fallback.
- [Horary and elective need minute-level house precision] → fixtures include houses and cusps; gate tolerance covers them explicitly.
- [MCP results are text-only; no structured handoff] → tool output designed as compact, model-readable tables with version metadata; typed handoff is not required for interpretation.
- [Model reliability for a strict multi-step flow] → prompt evaluation before pinning; hard truth rules; explicit "calculations unavailable" path instead of guessing.
- [Second Node process on a 512 MB droplet with a 320 MB heap cap] → measure RSS during the spike; shared image; vertical resize remains the scaling path.
- [MCP instructions/tools are fetched at startup] → if the sidecar is down, the persona core still exists in `promptPrefix` and the agent reports calculations unavailable; compose healthcheck and restart policy mitigate.
- [Plain HTTP transports and stores birth data in transit] → development droplet only; TLS is a prerequisite change before real users; no third-party profiles are collected by the supported techniques.
- [Geocoding provider coverage and rate limits for the CIS] → provider is configurable behind one module; no residency guarantees yet.
- [Single-replica cache assumption] → documented; a shared cache is a separate change when replicas grow.
- [Deferred techniques create user expectation gaps] → the agent states unavailability and offers supported fallbacks (spec: technique selection).

## Migration Plan

1. Land the engine and service packages, config schema, profile storage, build stages, and compose service with the feature disabled.
2. Enable on the development droplet: set the `astrology` config, MCP entry, and spec in `librechat.yaml`; provide `MONGO_URI` and the service token; restart.
3. Rollback: disable the config and revert the commit; the existing commit-addressed image rollback redeploys any prior image. Profiles remain in the collection but are unreachable while the feature is disabled; no destructive migration runs.
4. No data migration: `AstroProfile` is a new collection; the account-deletion cascade covers removal.

## Open Questions

- Geocoding provider default for development (Photon, GeoNames, or a hosted alternative) — decided during implementation; the lever exists either way.
- Final prompt wording and the exact pinned model — content and evaluation work, neither changes the approach.
