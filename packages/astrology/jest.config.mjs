import { maxWorkers } from '../../config/jest.workers.cjs';

export default {
  collectCoverageFrom: ['src/**/*.{js,ts}', '!<rootDir>/node_modules/'],
  coveragePathIgnorePatterns: ['/node_modules/', '/dist/'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/__tests__/helpers/'],
  coverageReporters: ['text', 'cobertura'],
  testResultsProcessor: 'jest-junit',
  transform: {
    '\\.[jt]sx?$': [
      'babel-jest',
      {
        presets: [
          ['@babel/preset-env', { targets: { node: 'current' } }],
          '@babel/preset-typescript',
        ],
      },
    ],
  },
  // caelus and caelus-birth ship ESM only; transform them to CJS for jest.
  transformIgnorePatterns: ['/node_modules/(?!(caelus|caelus-birth)/)'],
  moduleNameMapper: {
    '^~/(.*)$': '<rootDir>/src/$1',
    // Source imports carry the ESM `.js` extension; jest resolves to `.ts`.
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  setupFiles: ['<rootDir>/../../config/jest.setup.logging.cjs'],
  maxWorkers,
  restoreMocks: true,
  testTimeout: 15000,
};
