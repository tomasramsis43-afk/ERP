/** Only the platform-independent core is unit tested here; screens need a device or emulator. */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/core/**/*.spec.ts', '<rootDir>/src/sync/**/*.spec.ts', '<rootDir>/src/api/**/*.spec.ts', '<rootDir>/src/db/**/*.spec.ts'],
  transform: { '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.jest.json' }] },
};
