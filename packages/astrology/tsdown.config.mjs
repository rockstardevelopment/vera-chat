import path from 'node:path';
import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  platform: 'node',
  dts: { oxc: true },
  outDir: 'dist',
  sourcemap: true,
  // `engine.ts` locates the ephemeris data from its own file location; the
  // shim defines `__filename` in the ESM output the way CJS has it natively.
  shims: true,
  checks: { circularDependency: true },
  deps: {
    neverBundle: (id) => !id.startsWith('.') && !path.isAbsolute(id),
  },
});
