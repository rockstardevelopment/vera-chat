## 1. Ephemeris spike and engine

- [ ] 1.1 Scaffold `packages/astrology` with the sibling package tooling (package.json, tsconfig, tsdown config, test runner) and verify `npm run build` succeeds in that workspace.
- [ ] 1.2 Implement `computeChart` over `caelus` behind the seam contract (plain input, `ChartFacts` output with engine/option versions) and verify a smoke test returns placements for a known chart.
- [ ] 1.3 Build the reference fixture harness (Swiss Ephemeris output for the fixture set: Russian DST 1985/1991/2011/2014, polar latitude, ambiguous and nonexistent local times, southern hemisphere) and verify every fixture passes the documented longitude, cusp, and retrograde tolerances; record the measured computation RSS for the droplet memory check.
- [ ] 1.4 Decide `caelus` versus a commercial Swiss Ephemeris license based on the gate result, pin the library version, and record the decision and measurements in the change's `design.md`; verify the record names the tolerances met and the memory measurement.
- [ ] 1.5 Implement `computeTransits`, `computeHorary`, and `findElectiveWindows` and verify unit tests cover determinism, DST-edge fixtures, and horary/elective option handling per technique.
- [ ] 1.6 Implement unknown-birth-time degradation (documented default time, confidence and unreliable-house marking) and verify a test asserts house-dependent facts are marked for a time-unknown input.

## 2. Service configuration

- [ ] 2.1 Define the service's configuration surface from its deployment environment (house system, orb profile, geocoding provider, per-user profile limit) with validation and documented defaults, and verify unit tests cover defaults, explicit overrides, and invalid values.

## 3. Profile storage

- [ ] 3.1 Add the `AstroProfile` schema, model, and methods in `packages/data-schemas` (labeled profiles, encrypted birth payload, tenant isolation) and verify unit tests cover create/list/update/delete plus encryption at rest (the raw stored payload exposes no birth fields).
- [ ] 3.2 Add profile deletion to the account-deletion cascade (`deleteAstroProfiles` in `packages/data-schemas` plus the call in `api/server/controllers/UserController.js`) and verify a test proves no profiles remain after user deletion.

## 4. MCP service

- [ ] 4.1 Scaffold `packages/astrology-mcp` as a workspace package with the MCP SDK dependency and a streamable-http entrypoint, then verify `npm run build` succeeds and a started server lists its tools.
- [ ] 4.2 Implement trusted identity handling (identity header required, 401 on absence, every operation scoped to the caller) and verify contract tests for missing and foreign identity return no data.
- [ ] 4.3 Implement place and timezone resolution with candidate lists and DST-ambiguity reporting behind the configurable provider, and verify unit tests for unambiguous, ambiguous, and nonexistent-local-time inputs; record the chosen development provider in `design.md`.
- [ ] 4.4 Implement the profile tools (`resolve_birth_place`, `save_birth_profile`, `update_birth_profile`, `delete_birth_profile`, `list_birth_profiles`) over the data-schemas methods and verify tool tests cover round trips, the profile limit rejection, and caller isolation.
- [ ] 4.5 Implement the computation tools (`get_natal_chart`, `get_transits`, `get_horary_chart`, `find_elective_windows`) returning facts with version metadata and structured errors, and verify tests cover facts-only results, determinism, and the engine-failure error path.
- [ ] 4.6 Add in-process result reuse keyed by inputs, options, and engine version and verify a test proves reuse within a process and no reuse across a version change.
- [ ] 4.7 Load `content/instructions.md` and advertise it as MCP server instructions and verify the server's initialize response carries the text.

## 5. Prompt and agent configuration

- [ ] 5.1 Write `packages/astrology-mcp/content/instructions.md` fresh from the requirements snapshot (`reference/requirements.md`) covering the behavior stages within this change's technique scope, and verify a review walkthrough against its example matrices (classification, category/goal, method, technique, fallbacks, answer contract).
- [ ] 5.2 Add the `vera-astrologer` model spec to the local operator `librechat.yaml` (endpoint `agents`, compact core prompt with language policy and date/time variables, MCP pin, starters) and the MCP entry options (`serverInstructions: true`, identity and service-token headers, `chatMenu: false`), then verify config validation succeeds and the spec resolves in a started API.
- [ ] 5.3 Evaluate two or three OpenRouter models with the real instructions, tools, and the requirements example matrices, pin the chosen model in `preset.model`, and verify the evaluation records classification, routing, tool-discipline, and answer-shape outcomes per candidate.

## 6. Build and deployment wiring

- [ ] 6.1 Add the fork-owned `Dockerfile.vera` (copy of `Dockerfile.multi` plus package.json copies, build stages, and dist copies for both new packages), point the `file:` selection in `deploy-development.yml` and `deploy-production.yml` at it, and verify a local image build contains the service entrypoint and upstream `Dockerfile.multi` is unchanged.
- [ ] 6.2 Add the `astrology-mcp` sidecar service to `deploy-compose.vera.yml` (same image, command, environment with the operator settings, healthcheck, no published port) and verify `docker compose config` renders and a local compose start reaches a healthy sidecar.
- [ ] 6.3 Add `mcpSettings.allowedAddresses` for the sidecar to `librechat.yaml` and verify the API resolves the server's tools in a local compose run.
- [ ] 6.4 Deploy to the development droplet with the MCP entry, spec, and sidecar environment in place and verify the astrologer is selectable and a first-run flow (starter, structured questions, place resolution, confirmation, natal answer) completes end to end.

## 7. Verification

- [ ] 7.1 Run `npx tsc --noEmit` in every changed workspace (`packages/astrology`, `packages/astrology-mcp`, `packages/data-schemas`) and verify no errors.
- [ ] 7.2 Run `npm run sort-imports` on the touched paths and verify no further diff remains.
- [ ] 7.3 Run `npm run lighthouse` and verify the visible-conversation LCP budget still passes after the startup config changes.
- [ ] 7.4 Exercise the four method flows on dev (natal, transits, horary, elective) plus one unknown-birth-time run, one unsupported-technique request, and one sidecar-down run, and verify each behavior matches the spec scenarios, including "calculations unavailable" instead of invented facts.

## 8. Documentation

- [ ] 8.1 Add `vera-docs/astrology.md` (fork-specific architecture, service deployment settings, operations, and the deferred-capability list) and update the page table in `vera-docs/index.md`; verify the new link resolves and the table entry describes the page.
- [ ] 8.2 Update `vera-docs/deployment.md` with the sidecar service, the `Dockerfile.vera` choice and its upstream-sync drift note, the operator environment keys, the `librechat.yaml` block the operator adds, the updated `docker ps` expectation (API plus sidecar on development), and the development-only/TLS caveat; add the new upstream-file conflict hot spots to `vera-docs/fork-workflow.md`; verify the documented commands match what task 6 executed.
- [ ] 8.3 Record the resolutions of the `design.md` open questions (geocoding default, timezone resolver, pinned model) in the change artifacts and verify no open question lacks a resolution or an explicit carry-forward note.
- [ ] 8.4 Remove `vera-docs/drafts/` (including its `index.md`) and verify no live references remain in `vera-docs/` or `openspec/changes/` (`grep -rn drafts`).
