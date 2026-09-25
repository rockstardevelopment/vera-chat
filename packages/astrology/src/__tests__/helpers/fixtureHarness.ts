import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import type { ChartFacts, HouseSystem } from '../../types';

export interface FixtureExpectedBody {
  longitude: number;
  retrograde: boolean;
}

export interface FixtureExpectedHouses {
  ascendant: number;
  midheaven: number;
  cusps: number[];
}

export interface FixtureLocal {
  date: string;
  time: string;
  zone: string;
  expectedOffsetMinutes: number | null;
  expectedStatus: 'ok' | 'ambiguous' | 'nonexistent';
}

export interface Fixture {
  id: string;
  description: string;
  input: {
    instantUtc: string;
    latitude: number;
    longitude: number;
    timeKnown: boolean;
  };
  options: { houseSystem: HouseSystem };
  local: FixtureLocal;
  expected: {
    bodies: Record<string, FixtureExpectedBody>;
    houses: Record<string, FixtureExpectedHouses>;
  };
}

export interface FixtureTolerances {
  bodyLongitudeArcsec: number;
  moonLongitudeArcsec: number;
  cuspArcsec: number;
  /** Only `exact` is supported; any other mode fails the gate. */
  retrograde: string;
}

export interface FixtureDocument {
  provenance: Record<string, unknown>;
  tolerances: FixtureTolerances;
  fixtures: Fixture[];
}

export function loadFixtureDocument(): FixtureDocument {
  const path = join(__dirname, '..', '..', '..', 'fixtures', 'charts.json');
  return JSON.parse(readFileSync(path, 'utf8')) as FixtureDocument;
}

/** Shortest angular separation in arcseconds, wrap-safe at 0/360. */
export function angularDifferenceArcsec(a: number, b: number): number {
  return Math.abs(((((a - b) % 360) + 540) % 360) - 180) * 3600;
}

/**
 * Compare computed facts against a fixture's Swiss Ephemeris reference and
 * return one human-readable line per violation; empty means the fixture passed.
 */
export function compareFacts(
  facts: ChartFacts,
  fixture: Fixture,
  tolerances: FixtureTolerances,
): string[] {
  const failures: string[] = [];
  const bodies = new Map(facts.bodies.map((body) => [body.id, body]));
  const retrogradeExact = tolerances.retrograde === 'exact';
  if (!retrogradeExact) {
    failures.push(`${fixture.id}: unsupported retrograde tolerance "${tolerances.retrograde}"`);
  }

  for (const [id, expected] of Object.entries(fixture.expected.bodies)) {
    const fact = bodies.get(id);
    if (fact === undefined) {
      failures.push(`${fixture.id}: body ${id} missing from computed facts`);
      continue;
    }
    const tolerance =
      id === 'moon' ? tolerances.moonLongitudeArcsec : tolerances.bodyLongitudeArcsec;
    const deviation = angularDifferenceArcsec(fact.longitude, expected.longitude);
    if (deviation > tolerance) {
      failures.push(
        `${fixture.id}: ${id} longitude off by ${deviation.toFixed(2)}" (tolerance ${tolerance}")`,
      );
    }
    if (retrogradeExact && fact.retrograde !== expected.retrograde) {
      failures.push(
        `${fixture.id}: ${id} retrograde flag ${fact.retrograde}, reference ${expected.retrograde}`,
      );
    }
  }

  const system = fixture.options.houseSystem;
  const expectedHouses = fixture.expected.houses[system];
  if (expectedHouses === undefined) {
    failures.push(`${fixture.id}: no reference houses for ${system}`);
    return failures;
  }
  expectedHouses.cusps.forEach((cusp, index) => {
    const deviation = angularDifferenceArcsec(facts.houses.cusps[index], cusp);
    if (deviation > tolerances.cuspArcsec) {
      failures.push(
        `${fixture.id}: cusp ${index + 1} off by ${deviation.toFixed(2)}" (tolerance ${tolerances.cuspArcsec}")`,
      );
    }
  });
  const ascDeviation = angularDifferenceArcsec(facts.houses.ascendant, expectedHouses.ascendant);
  if (ascDeviation > tolerances.cuspArcsec) {
    failures.push(
      `${fixture.id}: Ascendant off by ${ascDeviation.toFixed(2)}" (tolerance ${tolerances.cuspArcsec}")`,
    );
  }
  const mcDeviation = angularDifferenceArcsec(facts.houses.midheaven, expectedHouses.midheaven);
  if (mcDeviation > tolerances.cuspArcsec) {
    failures.push(
      `${fixture.id}: Midheaven off by ${mcDeviation.toFixed(2)}" (tolerance ${tolerances.cuspArcsec}")`,
    );
  }

  return failures;
}
