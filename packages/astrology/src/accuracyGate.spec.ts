import { toUT } from 'caelus-birth';
import type { Fixture } from './__tests__/helpers/fixtureHarness';
import { compareFacts, loadFixtureDocument } from './__tests__/helpers/fixtureHarness';
import { computeChart } from './engine';

const document = loadFixtureDocument();

function localParts(fixture: Fixture) {
  const [year, month, day] = fixture.local.date.split('-').map(Number);
  const [hour, minute] = fixture.local.time.split(':').map(Number);
  return { year, month, day, hour, minute };
}

describe('accuracy gate against Swiss Ephemeris', () => {
  it('carries provenance and a fixed fixture set', () => {
    expect(document.provenance.reference).toContain('Swiss Ephemeris');
    expect(document.fixtures.length).toBeGreaterThanOrEqual(11);
  });

  it.each(document.fixtures.map((fixture) => [fixture.id, fixture] as const))(
    '%s resolves the local time exactly and matches the reference within tolerance',
    (_id, fixture) => {
      const { year, month, day, hour, minute } = localParts(fixture);
      const resolved = toUT({
        year,
        month,
        day,
        hour,
        minute,
        lat: fixture.input.latitude,
        lon: fixture.input.longitude,
        zone: fixture.local.zone,
      });

      expect(resolved.status).toBe(fixture.local.expectedStatus);
      if (fixture.local.expectedOffsetMinutes !== null) {
        expect(resolved.offsetMinutes).toBe(fixture.local.expectedOffsetMinutes);
      }
      const resolvedInstant = Date.UTC(
        resolved.utc.year,
        resolved.utc.month - 1,
        resolved.utc.day,
        resolved.utc.hour,
        resolved.utc.minute,
        resolved.utc.second,
      );
      expect(resolvedInstant).toBe(new Date(fixture.input.instantUtc).getTime());

      const facts = computeChart(fixture.input, fixture.options);
      expect(compareFacts(facts, fixture, document.tolerances)).toEqual([]);
    },
  );

  it('reports an unsupported retrograde tolerance instead of ignoring it', () => {
    const fixture = document.fixtures[0];
    const facts = computeChart(fixture.input, fixture.options);
    const failures = compareFacts(facts, fixture, {
      ...document.tolerances,
      retrograde: 'approximate',
    });

    expect(failures.join('\n')).toContain('unsupported retrograde tolerance');
  });

  it('reports the whole-sign fallback when Placidus is requested at a polar latitude', () => {
    const polar = document.fixtures.find((fixture) => fixture.id === 'polar-tromso');
    expect(polar).toBeDefined();
    const facts = computeChart({ ...polar!.input }, { houseSystem: 'placidus' });

    expect(facts.houses.requestedSystem).toBe('placidus');
    expect(facts.houses.system).toBe('whole_sign');
  });
});
