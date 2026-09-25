import type { ChartInput } from './types';
import { computeChart } from './engine';

const NOON_DEFAULT: ChartInput = {
  instantUtc: '1990-06-10T09:00:00.000Z',
  latitude: 55.7558,
  longitude: 37.6173,
  timeKnown: false,
};

describe('unknown birth time', () => {
  it('marks a time-unknown chart and its houses as unreliable', () => {
    const facts = computeChart(NOON_DEFAULT);

    expect(facts.meta.timeConfidence).toBe('unknown');
    expect(facts.houses.reliable).toBe(false);
    // The default-time chart still computes; it is marked, not withheld.
    expect(facts.houses.cusps).toHaveLength(12);
  });

  it('does not mark a chart with a known birth time', () => {
    const facts = computeChart({ ...NOON_DEFAULT, timeKnown: true });

    expect(facts.meta.timeConfidence).toBe('known');
    expect(facts.houses.reliable).toBe(true);
  });
});
