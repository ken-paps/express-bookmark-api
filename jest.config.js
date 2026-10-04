/**
 * Jest configuration for the Express API integration test suite.
 *
 * The suite talks to a real (but dedicated) MySQL database via Supertest +
 * Prisma, so it needs a longer startup timeout on the first run when Prisma
 * compiles the query engine.
 */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  testTimeout: 30000,
};