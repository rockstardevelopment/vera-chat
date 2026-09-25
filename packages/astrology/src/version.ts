/**
 * Version metadata stamped onto every computed result. `engine.spec.ts` asserts
 * these match the package manifests so a bump cannot drift from the facts.
 */

/** This package's version (`packages/astrology/package.json`). */
export const ENGINE_VERSION = '0.1.0';

/** The pinned ephemeris library version (`caelus`). */
export const EPHEMERIS_VERSION = '0.24.1';
