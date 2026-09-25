import type { ChartOptions, HouseSystem, OrbProfile } from './types.js';

/**
 * Default orb limits for major aspects, in degrees. Aligned with the pinned
 * ephemeris library's own default table so the seam's documented default and
 * the calculator's agree by construction.
 */
export const DEFAULT_ORB_PROFILE: Required<OrbProfile> = {
  conjunction: 8,
  sextile: 4,
  square: 7,
  trine: 7,
  opposition: 8,
};

export const DEFAULT_HOUSE_SYSTEM: HouseSystem = 'placidus';

export const HOUSE_SYSTEMS: readonly HouseSystem[] = [
  'placidus',
  'whole_sign',
  'equal',
  'porphyry',
];

/** Options with every default applied; what the engine actually computes with. */
export interface ResolvedOptions {
  houseSystem: HouseSystem;
  orbProfile: Required<OrbProfile>;
  zodiac: 'tropical';
}

const ORB_KEYS = ['conjunction', 'sextile', 'square', 'trine', 'opposition'] as const;
const MAX_ORB_DEGREES = 30;

export function normalizeHouseSystem(raw: string): HouseSystem {
  const normalized = raw
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  if ((HOUSE_SYSTEMS as readonly string[]).includes(normalized)) {
    return normalized as HouseSystem;
  }
  throw new RangeError(`unsupported house system "${raw}"; supported: ${HOUSE_SYSTEMS.join(', ')}`);
}

export function resolveOptions(options: ChartOptions = {}): ResolvedOptions {
  const houseSystem =
    options.houseSystem === undefined
      ? DEFAULT_HOUSE_SYSTEM
      : normalizeHouseSystem(options.houseSystem);
  const zodiac = options.zodiac ?? 'tropical';
  if (zodiac !== 'tropical') {
    throw new RangeError('only the tropical zodiac is supported by this deployment');
  }
  const orbProfile: Required<OrbProfile> = { ...DEFAULT_ORB_PROFILE };
  for (const key of ORB_KEYS) {
    const value = options.orbProfile?.[key];
    if (value === undefined) {
      continue;
    }
    if (!Number.isFinite(value) || value < 0 || value > MAX_ORB_DEGREES) {
      throw new RangeError(`orbProfile.${key} must be a finite number in [0, ${MAX_ORB_DEGREES}]`);
    }
    orbProfile[key] = value;
  }
  return { houseSystem, orbProfile, zodiac };
}

/**
 * Stable FNV-1a hash of the resolved options, hex-encoded. Deterministic across
 * processes and platforms, which is all result reuse and cache invalidation
 * need; unlike `crypto` it keeps the engine runnable in any JS runtime.
 */
export function hashOptions(options: ResolvedOptions): string {
  const canonical = JSON.stringify({
    houseSystem: options.houseSystem,
    orbProfile: {
      conjunction: options.orbProfile.conjunction,
      sextile: options.orbProfile.sextile,
      square: options.orbProfile.square,
      trine: options.orbProfile.trine,
      opposition: options.orbProfile.opposition,
    },
    zodiac: options.zodiac,
  });
  let hash = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i += 1) {
    hash ^= canonical.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}
