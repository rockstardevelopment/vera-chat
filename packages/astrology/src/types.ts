/**
 * Plain-data contract for the astrology engine. The seam is pure: no IO, no
 * timezone or place resolution, no language-model input. Callers resolve a
 * birth (or event) local time to a UT instant and pass coordinates; the engine
 * returns facts with the versions that produced them.
 */

/** House systems this deployment computes. */
export type HouseSystem = 'placidus' | 'whole_sign' | 'equal' | 'porphyry';

/** Whether the instant came from a known time or the documented default. */
export type TimeConfidence = 'known' | 'unknown';

export interface ChartInput {
  /** UT instant of the chart moment. Strings must be ISO 8601 with a zone. */
  instantUtc: Date | string;
  /** Geographic latitude in degrees, north positive. */
  latitude: number;
  /** Geographic longitude in degrees, east positive. */
  longitude: number;
  /**
   * False when the birth time is unknown and the caller applied the documented
   * noon default; the engine then marks the result as time-unknown.
   */
  timeKnown: boolean;
}

/** Per-aspect orb limits in degrees; partial profiles merge over the defaults. */
export interface OrbProfile {
  conjunction?: number;
  sextile?: number;
  square?: number;
  trine?: number;
  opposition?: number;
}

export interface ChartOptions {
  /** Defaults to `placidus`, with the engine's documented polar fallback. */
  houseSystem?: HouseSystem;
  /** Orb limits for major aspects; defaults to `DEFAULT_ORB_PROFILE`. */
  orbProfile?: OrbProfile;
  /** Only the tropical zodiac is supported by this deployment. */
  zodiac?: 'tropical';
}

/** One body's apparent geocentric ecliptic position. */
export interface BodyFact {
  /** Body id, e.g. `sun`, `moon`, `true_node`. */
  id: string;
  /** Ecliptic longitude in degrees, `[0, 360)`. */
  longitude: number;
  /** Ecliptic latitude in degrees. */
  latitude: number;
  /** Daily motion in longitude, degrees/day; negative when retrograde. */
  speed: number;
  retrograde: boolean;
  /** Zodiac sign containing the longitude, e.g. `Leo`. */
  sign: string;
  /** Longitude within the sign, degrees `[0, 30)`. */
  signDegrees: number;
  /** 1-based house by the chart's cusps; meaningless when houses are unreliable. */
  house: number;
}

export interface HouseFact {
  /** The house system actually used; differs from the request at polar latitudes. */
  system: HouseSystem;
  /** The house system originally requested, before any polar fallback. */
  requestedSystem: HouseSystem;
  /** Twelve cusp longitudes in degrees, house 1 first. */
  cusps: number[];
  ascendant: number;
  midheaven: number;
  /** False when the birth time is unknown: Ascendant and houses are not facts. */
  reliable: boolean;
}

export interface AspectFact {
  bodyA: string;
  bodyB: string;
  /** Aspect name, e.g. `trine`. */
  aspect: string;
  /** Orb from exact, in degrees. */
  orb: number;
  /** Applying, separating, or exact. */
  phase: 'applying' | 'separating' | 'exact';
  /** Closeness in `[0, 1]`: `1` exact, `0` at the orb limit. */
  strength: number;
}

export interface ChartMeta {
  /** Version of this engine package. */
  engineVersion: string;
  /** Version of the pinned ephemeris library. */
  ephemerisVersion: string;
  /** Stable hash of the options that produced this result. */
  optionsHash: string;
  timeConfidence: TimeConfidence;
}

export interface ChartFacts {
  /** The instant as a Julian Day (UT). */
  jdUt: number;
  bodies: BodyFact[];
  houses: HouseFact;
  aspects: AspectFact[];
  /** Validity statements, e.g. a position outside its validated span. */
  warnings: string[];
  /** Requested bodies omitted because the instant is outside their fitted range. */
  unavailable: string[];
  meta: ChartMeta;
}
