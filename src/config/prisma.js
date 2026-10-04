require('dotenv').config();

const { PrismaClient } = require('../generated/prisma');
const { PrismaMariaDb } = require('@prisma/adapter-mariadb');

// Prisma ORM v7 no longer reads the datasource URL from schema.prisma.
// The connection details are passed directly to the driver adapter, which
// uses the `mariadb` Node.js driver under the hood (MySQL-compatible).
//
// Under test we point the client at a dedicated database so the suite never
// touches development data.
const connectionString =
  process.env.NODE_ENV === 'test'
    ? process.env.DATABASE_URL_TEST || process.env.DATABASE_URL
    : process.env.DATABASE_URL;

const url = new URL(connectionString);

const adapter = new PrismaMariaDb({
  host: url.hostname,
  port: Number(url.port) || 3306,
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: url.pathname.replace(/^\//, ''),
});

// Reuse a single PrismaClient instance across the app.
// In development, nodemon restarts can leak connections if we create a new
// client on every reload, so we cache the instance on the global object.
const globalForPrisma = globalThis;

const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

module.exports = prisma;

