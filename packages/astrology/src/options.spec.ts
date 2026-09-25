import {
  DEFAULT_HOUSE_SYSTEM,
  DEFAULT_ORB_PROFILE,
  hashOptions,
  normalizeHouseSystem,
  resolveOptions,
} from './options';

describe('resolveOptions', () => {
  it('applies the documented defaults', () => {
    const resolved = resolveOptions();

    expect(resolved.houseSystem).toBe(DEFAULT_HOUSE_SYSTEM);
    expect(resolved.orbProfile).toEqual(DEFAULT_ORB_PROFILE);
    expect(resolved.zodiac).toBe('tropical');
  });

  it('merges a partial orb profile over the defaults', () => {
    const resolved = resolveOptions({ orbProfile: { trine: 9 } });

    expect(resolved.orbProfile.trine).toBe(9);
    expect(resolved.orbProfile.conjunction).toBe(DEFAULT_ORB_PROFILE.conjunction);
  });

  it('rejects an unsupported house system and orb value', () => {
    expect(() => resolveOptions({ houseSystem: 'koch' as never })).toThrow(RangeError);
    expect(() => resolveOptions({ orbProfile: { square: -1 } })).toThrow(RangeError);
    expect(() => resolveOptions({ orbProfile: { square: Number.NaN } })).toThrow(RangeError);
  });
});

describe('normalizeHouseSystem', () => {
  it.each([
    ['Whole Sign', 'whole_sign'],
    ['whole-sign', 'whole_sign'],
    ['PLACIDUS', 'placidus'],
    [' equal ', 'equal'],
  ])('normalizes %s', (raw, expected) => {
    expect(normalizeHouseSystem(raw)).toBe(expected);
  });
});

describe('hashOptions', () => {
  it('is stable and sensitive to option changes', () => {
    const base = resolveOptions();
    const withOrbs = resolveOptions({ orbProfile: { sextile: 6 } });

    expect(hashOptions(base)).toBe(hashOptions(resolveOptions()));
    expect(hashOptions(base)).not.toBe(hashOptions(withOrbs));
  });
});
