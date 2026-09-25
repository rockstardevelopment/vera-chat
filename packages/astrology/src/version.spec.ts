import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { ENGINE_VERSION, EPHEMERIS_VERSION } from './version';

const nodeRequire = createRequire(__filename);
const ownManifest = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));
const caelusManifest = JSON.parse(readFileSync(nodeRequire.resolve('caelus/package.json'), 'utf8'));

describe('version metadata', () => {
  it('matches this package manifest and pins the ephemeris it was built against', () => {
    expect(ENGINE_VERSION).toBe(ownManifest.version);
    expect(EPHEMERIS_VERSION).toBe(ownManifest.dependencies.caelus);
    expect(EPHEMERIS_VERSION).toBe(caelusManifest.version);
  });

  it('resolves the caelus data directory the engine loads from', () => {
    const dataDir = join(dirname(nodeRequire.resolve('caelus/package.json')), 'data');

    expect(readFileSync(join(dataDir, 'nutation_iau1980.json'), 'utf8').length).toBeGreaterThan(0);
  });
});
