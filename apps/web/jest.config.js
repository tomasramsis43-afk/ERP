module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/lib/**/*.spec.ts'],
  transform: { '^.+\\.tsx?$': ['ts-jest', { tsconfig: { module: 'commonjs', moduleResolution: 'node', esModuleInterop: true, strict: true, target: 'es2022' } }] },
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/$1' },
};
