# @librechat/astrology

Deterministic astrology computation for the Vera astrologer agent. The engine is
a pure seam: plain data in, plain facts out, no IO, no timezone or place
resolution, no language-model input. Callers resolve a birth (or event) local
time to a UT instant and pass coordinates; every fact carries the engine and
option versions that produced it.

```ts
import { computeChart } from '@librechat/astrology';

const facts = computeChart(
  {
    instantUtc: '1990-06-10T18:30:00.000Z',
    latitude: 27.95,
    longitude: -82.46,
    timeKnown: true,
  },
  { houseSystem: 'placidus' },
);
```

## Contract

| Input | Meaning |
| --- | --- |
| `instantUtc` | UT instant (`Date` or zoned ISO-8601 string) |
| `latitude`, `longitude` | Degrees, north and east positive |
| `timeKnown` | `false` applies the documented noon default at the caller and marks the result |

| Option | Default | Notes |
| --- | --- | --- |
| `houseSystem` | `placidus` | `placidus`, `whole_sign`, `equal`, `porphyry`; the engine reports `system` separately from `requestedSystem` when it falls back |
| `orbProfile` | conjunction 8°, sextile 4°, square 7°, trine 7°, opposition 8° | Partial profiles merge over the defaults |
| `zodiac` | `tropical` | Only the tropical zodiac is supported by this deployment |

Output (`ChartFacts`): bodies with longitude, latitude, speed, retrograde flag,
sign, and house; the twelve cusps plus Ascendant and Midheaven; major aspects;
engine warnings and unavailable bodies; and `meta` with `engineVersion`,
`ephemerisVersion`, `optionsHash`, and `timeConfidence`. An unknown birth time
sets `meta.timeConfidence` to `unknown` and `houses.reliable` to `false`; the
default-time chart is still computed, but Ascendant and house facts are marked
as not reliable. The supported computation range reported by the library is
1000–3000 CE; bodies outside their fitted pack range are omitted into
`unavailable` and warned about when computed outside their validated span.

## Verdict: `caelus` 0.24.1, pinned

The accuracy gate ran against Swiss Ephemeris 2.10.03 on the fixed fixture set
in `fixtures/` (Russian DST 1985/1991/2011/2014, polar latitude, southern
hemisphere, ambiguous and nonexistent local times, retrograde cases).
`caelus` is kept and pinned.

| Fact class | Threshold | Measured worst case |
| --- | --- | --- |
| Body longitude, Sun–Pluto, Chiron, nodes | 5″ | 0.25″ |
| Body longitude, Moon | 10″ | 0.11″ |
| House cusps, Ascendant, Midheaven | 10″ | 0.10″ |
| Retrograde flag | exact | exact on all 11 fixtures |

Local civil time resolution was checked against the IANA tz database
(`zoneinfo`) independently of the engine and matched exactly on all Moscow DST
cases, including an ambiguous fall-back hour (earlier instant chosen) and a
nonexistent spring-forward time. The caller-side resolver is `caelus-birth`
(DST, half-hour zones, ambiguous and nonexistent times); the engine itself never
touches timezones.

Placidus and Koch are undefined at polar latitudes; the engine falls back to
Whole Sign and reports both the requested and the actual system. The reference
compares Whole Sign cusps there.

## Measured footprint

Measured with the Node data packs (embedded VSOP tier, precise Moon and planet
Chebyshev packs), under a 256 MB V8 heap cap on Node 24:

- Engine load: +89 MB RSS over a bare process.
- After 5 charts: +131 MB RSS.
- After 500 charts: +221 MB RSS (allocator retention; roughly 0.9–1.4 ms per chart).

This footprint is tight for the 512 MB droplet beside the API, so the service
child re-measures it in the sidecar and a vertical resize remains the
documented scaling path.

## Development

```bash
npm run build       # tsdown
npm run test:ci     # jest, includes the accuracy gate
npx tsc --noEmit
```

Fixtures and their provenance are documented in [`fixtures/README.md`](./fixtures/README.md).
