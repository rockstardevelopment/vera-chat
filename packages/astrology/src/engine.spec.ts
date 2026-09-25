import type { ChartInput } from './types';
import { ENGINE_VERSION, EPHEMERIS_VERSION } from './version';
import { computeChart } from './engine';

const KNOWN_CHART: ChartInput = {
  instantUtc: '1990-06-10T18:30:00.000Z',
  latitude: 27.95,
  longitude: -82.46,
  timeKnown: true,
};

const CORE_BODIES = [
  'sun',
  'moon',
  'mercury',
  'venus',
  'mars',
  'jupiter',
  'saturn',
  'uranus',
  'neptune',
  'pluto',
  'mean_node',
  'true_node',
];

describe('computeChart', () => {
  it('returns every core body, twelve cusps, and version metadata', () => {
    const facts = computeChart(KNOWN_CHART);
    const ids = facts.bodies.map((body) => body.id);

    expect(ids).toEqual(expect.arrayContaining(CORE_BODIES));
    expect(facts.houses.cusps).toHaveLength(12);
    expect(Number.isFinite(facts.houses.ascendant)).toBe(true);
    expect(Number.isFinite(facts.houses.midheaven)).toBe(true);
    expect(facts.meta.engineVersion).toBe(ENGINE_VERSION);
    expect(facts.meta.ephemerisVersion).toBe(EPHEMERIS_VERSION);
    expect(facts.meta.optionsHash).toMatch(/^[0-9a-f]{8}$/);
  });

  it('is deterministic for identical input and options', () => {
    expect(JSON.stringify(computeChart(KNOWN_CHART))).toBe(
      JSON.stringify(computeChart(KNOWN_CHART)),
    );
  });

  it('changes the options hash when the options change', () => {
    const placidus = computeChart(KNOWN_CHART);
    const wholeSign = computeChart(KNOWN_CHART, { houseSystem: 'whole_sign' });

    expect(placidus.meta.optionsHash).not.toBe(wholeSign.meta.optionsHash);
    expect(wholeSign.houses.system).toBe('whole_sign');
  });

  it('accepts a Date instant', () => {
    const asDate = computeChart({ ...KNOWN_CHART, instantUtc: new Date(KNOWN_CHART.instantUtc) });
    const asString = computeChart(KNOWN_CHART);

    expect(asDate.jdUt).toBe(asString.jdUt);
  });

  it('rejects an unzoned instant string', () => {
    expect(() => computeChart({ ...KNOWN_CHART, instantUtc: '1990-06-10T14:30:00' })).toThrow(
      TypeError,
    );
  });

  it('rejects invalid coordinates and a non-boolean timeKnown', () => {
    expect(() => computeChart({ ...KNOWN_CHART, latitude: 91 })).toThrow(RangeError);
    expect(() => computeChart({ ...KNOWN_CHART, longitude: -181 })).toThrow(RangeError);
    expect(() => computeChart({ ...KNOWN_CHART, timeKnown: undefined as never })).toThrow(
      TypeError,
    );
  });
});
