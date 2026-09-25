import { toUT } from 'caelus-birth';

const MOSCOW = { lat: 55.7558, lon: 37.6173, zone: 'Europe/Moscow' };

describe('birth time resolution (harness resolver)', () => {
  it('resolves an unambiguous local time to the only instant', () => {
    const resolved = toUT({ year: 2014, month: 12, day: 15, hour: 12, minute: 0, ...MOSCOW });

    expect(resolved.status).toBe('ok');
    expect(resolved.offsetMinutes).toBe(180);
    expect(resolved.utc).toEqual({ year: 2014, month: 12, day: 15, hour: 9, minute: 0, second: 0 });
  });

  it('reports a fall-back hour as ambiguous and chooses the earlier instant', () => {
    const resolved = toUT({ year: 2014, month: 10, day: 26, hour: 1, minute: 30, ...MOSCOW });

    expect(resolved.status).toBe('ambiguous');
    expect(resolved.candidates).toHaveLength(2);
    expect(resolved.offsetMinutes).toBe(240);
    expect(resolved.utc).toEqual({
      year: 2014,
      month: 10,
      day: 25,
      hour: 21,
      minute: 30,
      second: 0,
    });
  });

  it('reports a spring-forward gap as nonexistent instead of silently choosing', () => {
    const resolved = toUT({ year: 2011, month: 3, day: 27, hour: 2, minute: 30, ...MOSCOW });

    expect(resolved.status).toBe('nonexistent');
    expect(resolved.utc).toEqual({
      year: 2011,
      month: 3,
      day: 26,
      hour: 23,
      minute: 30,
      second: 0,
    });
  });
});
