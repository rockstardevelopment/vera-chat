# Accuracy fixtures

Reference data for the accuracy gate: every fixture pairs a chart input with
Swiss Ephemeris output for the same instant, place, and options. `npm run test:ci`
computes each fixture through `computeChart` and fails when a body longitude,
house cusp, or retrograde flag disagrees beyond the documented tolerance.

## Provenance

| Field | Value |
| --- | --- |
| Reference | Swiss Ephemeris 2.10.03 (`pyswisseph` 2.10.3.2) |
| Data files | `sepl_18.se1`, `semo_18.se1`, `seas_18.se1` (1800–2399 CE) |
| Generated | 2026-09-24 |
| Flag set | `SEFLG_SWIEPH | SEFLG_SPEED`; houses via `swe_houses_ex` (UT) |
| Generator | [`generate_fixtures.py`](./generate_fixtures.py) |

Local civil times in the `local` block are resolved independently with the
IANA tz database (`zoneinfo`), not with the engine: the gate therefore checks
the engine's timezone resolution against a second implementation. For a
nonexistent local time the reference stores no offset (libraries report the
pre- or post-transition one inconsistently) and the instant is asserted
instead.

## Regenerating

`generate_fixtures.py` is a manual tool: it is not part of the build or the
test suite, and Swiss Ephemeris is installed only where the script runs.

1. Install the reference oracle outside the repository:

   ```bash
   python3 -m pip install --target /tmp/vera-se-py pyswisseph
   ```

2. Download the ephemeris files it reads:

   ```bash
   mkdir -p /tmp/vera-se-ephe
   for f in sepl_18.se1 semo_18.se1 seas_18.se1; do
     curl -fsSL -o "/tmp/vera-se-ephe/$f" \
       "https://raw.githubusercontent.com/aloistr/swisseph/master/ephe/$f"
   done
   ```

3. From `packages/astrology`, run the generator and write its stdout to
   `charts.json`:

   ```bash
   PYTHONPATH=/tmp/vera-se-py python3 fixtures/generate_fixtures.py \
     --ephe-path /tmp/vera-se-ephe > fixtures/charts.json
   ```

   The script prints the whole fixture document to stdout, which is why the
   command redirects it into the file; progress goes to stderr. Pass
   `--generated-at 2026-09-24` to reproduce the committed provenance date
   exactly, or omit it to stamp today's date. `--help` lists both options, and
   a missing `pyswisseph` or ephemeris file fails with the commands above.

## Pass criteria

The gate reads its tolerances from the fixture document itself:
[`charts.json`](./charts.json) → `tolerances` — body longitudes (the Moon has
its own limit), house cusps with the Ascendant and Midheaven, and the
retrograde mode. They are minted by `generate_fixtures.py`, so changing a
threshold means editing it there and regenerating.

At polar latitudes Placidus is undefined in both engines; that fixture compares
Whole Sign cusps, and the engine's Placidus-to-Whole-Sign fallback is covered
by the engine unit tests.

## Fixture set

| Id | Covers |
| --- | --- |
| `ru-dst-1985-summer-moscow` | Russian DST, summer offset 1985 |
| `ru-dst-1991-summer-moscow` | 1991, the year the DST rule changed |
| `ru-dst-2011-nonexistent-moscow` | Spring-forward gap; local time does not exist |
| `ru-dst-2011-summer-moscow` | Permanent summer time 2011 |
| `ru-dst-2014-ambiguous-moscow` | Fall-back hour; local time occurs twice |
| `ru-dst-2014-winter-moscow` | Permanent standard time 2014 |
| `polar-tromso` | Polar latitude, Whole Sign cusp comparison |
| `southern-sydney` | Southern hemisphere |
| `retrograde-mercury-berlin` | Mercury retrograde |
| `retrograde-mars-berlin` | Mars retrograde |
| `baseline-new-york-2000` | J2000-adjacent northern baseline |
