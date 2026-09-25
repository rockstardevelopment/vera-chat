import { dirname, join } from 'node:path';
import { Engine, julianDay } from 'caelus';
import { loadNodeData } from 'caelus/node';
import { createRequire } from 'node:module';
import type { ChartFacts, ChartInput, ChartOptions, HouseSystem } from './types.js';
import { HOUSE_SYSTEMS, hashOptions, resolveOptions } from './options.js';
import { ENGINE_VERSION, EPHEMERIS_VERSION } from './version.js';

/**
 * CJS bundles expose `__filename`; ESM output does not. The fallback path is
 * only a resolution base, and both the test runner and the deployed service
 * run from inside the repository, where `caelus` resolves upward.
 */
declare const __filename: string | undefined;

const ZONED_ISO = /(?:Z|[+-]\d{2}:?\d{2})$/i;

let engine: Engine | null = null;

function resolveEngine(): Engine {
  if (engine === null) {
    const base = typeof __filename === 'string' ? __filename : join(process.cwd(), 'index.js');
    const require = createRequire(base);
    const dataDir = join(dirname(require.resolve('caelus/package.json')), 'data');
    engine = new Engine(loadNodeData(dataDir, 'embedded', 'full'));
  }
  return engine;
}

function parseInstant(instantUtc: Date | string): Date {
  if (typeof instantUtc === 'string' && !ZONED_ISO.test(instantUtc)) {
    throw new TypeError('instantUtc must be an ISO-8601 string with a zone (Z or offset)');
  }
  const instant = instantUtc instanceof Date ? instantUtc : new Date(instantUtc);
  if (Number.isNaN(instant.getTime())) {
    throw new TypeError('instantUtc must be a valid Date or ISO-8601 string');
  }
  return instant;
}

function toHouseSystem(raw: string): HouseSystem {
  if ((HOUSE_SYSTEMS as readonly string[]).includes(raw)) {
    return raw as HouseSystem;
  }
  throw new Error(`engine returned unsupported house system "${raw}"`);
}

function validate(input: ChartInput): void {
  if (typeof input !== 'object' || input === null) {
    throw new TypeError('input must be a ChartInput object');
  }
  if (!Number.isFinite(input.latitude) || input.latitude < -90 || input.latitude > 90) {
    throw new RangeError('latitude must be a finite number in [-90, 90]');
  }
  if (!Number.isFinite(input.longitude) || input.longitude < -180 || input.longitude > 180) {
    throw new RangeError('longitude must be a finite number in [-180, 180]');
  }
  if (typeof input.timeKnown !== 'boolean') {
    throw new TypeError('timeKnown must be a boolean');
  }
}

/**
 * Compute a natal chart as pure facts. Deterministic for identical input and
 * options; the caller resolves local time to `instantUtc` first, applying the
 * documented 12:00 noon default when the birth time is unknown.
 */
export function computeChart(input: ChartInput, options: ChartOptions = {}): ChartFacts {
  validate(input);
  const instant = parseInstant(input.instantUtc);
  const resolved = resolveOptions(options);
  const jdUt = julianDay(
    instant.getUTCFullYear(),
    instant.getUTCMonth() + 1,
    instant.getUTCDate(),
    instant.getUTCHours(),
    instant.getUTCMinutes(),
    instant.getUTCSeconds(),
  );
  const chart = resolveEngine().chartAt(jdUt, input.latitude, input.longitude, {
    houseSystem: resolved.houseSystem,
    orbs: resolved.orbProfile,
    zodiac: resolved.zodiac,
  });
  return {
    jdUt: chart.jdUt,
    bodies: Object.entries(chart.bodies).flatMap(([id, body]) =>
      body === undefined
        ? []
        : [
            {
              id,
              longitude: body.lon,
              latitude: body.lat,
              speed: body.speed,
              retrograde: body.retrograde,
              sign: body.sign,
              signDegrees: body.signDeg,
              house: body.house,
            },
          ],
    ),
    houses: {
      system: toHouseSystem(chart.houseSystem),
      requestedSystem: toHouseSystem(chart.houseSystemRequested),
      cusps: [...chart.cusps],
      ascendant: chart.angles.asc,
      midheaven: chart.angles.mc,
      reliable: input.timeKnown,
    },
    aspects: chart.aspects.map((aspect) => ({
      bodyA: aspect.a,
      bodyB: aspect.b,
      aspect: aspect.aspect,
      orb: aspect.orb,
      phase: aspect.phase,
      strength: aspect.strength,
    })),
    warnings: chart.warnings.map((warning) => warning.text),
    unavailable: [...chart.unavailable],
    meta: {
      engineVersion: ENGINE_VERSION,
      ephemerisVersion: EPHEMERIS_VERSION,
      optionsHash: hashOptions(resolved),
      timeConfidence: input.timeKnown ? 'known' : 'unknown',
    },
  };
}
