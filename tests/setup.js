/**
 * Global test setup (runs once per test file, before every test).
 *
 * Every test starts from a completely empty database so that assertions about
 * counts, ownership and pagination are deterministic. Tables are truncated -
 * rather than deleted - so AUTO_INCREMENT counters are reset as well.
 *
 * Why a dedicated connection?
 * The Prisma MariaDB driver adapter owns an internal connection pool, so a
 * session-scoped `SET FOREIGN_KEY_CHECKS = 0` issued through `$executeRawUnsafe`
 * is not guaranteed to apply to the connection that later runs TRUNCATE. Opening
 * one explicit connection and running the whole reset on it makes the toggle
 * reliable (MySQL refuses to TRUNCATE a table referenced by a foreign key unless
 * the check is disabled on that same connection).
 */

require('dotenv').config();

const mariadb = require('mariadb');

const prisma = require('../src/config/prisma');
const { registerUser } = require('./helpers');

// Child tables first, so the intent stays readable even though FK checks are off.
const TABLES = ['Bookmark', 'BlacklistedToken', 'RefreshToken', 'User'];

const connectionString =
  process.env.DATABASE_URL_TEST || process.env.DATABASE_URL;
const url = new URL(connectionString);

let resetConnection;

beforeAll(async () => {
  resetConnection = await mariadb.createConnection({
    host: url.hostname,
    port: Number(url.port) || 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ''),
  });
});

beforeEach(async () => {
  await resetConnection.query('SET FOREIGN_KEY_CHECKS = 0');

  for (const table of TABLES) {
    await resetConnection.query(`TRUNCATE TABLE \`${table}\``);
  }

  await resetConnection.query('SET FOREIGN_KEY_CHECKS = 1');
});

afterAll(async () => {
  if (resetConnection) {
    await resetConnection.end();
  }

  // Release every pooled connection so Jest exits without leaked handles.
  await prisma.$disconnect();
});

/**
 * Create a user and promote them to the admin role directly through Prisma.
 *
 * The account is registered through the real endpoint (so the password is
 * hashed and tokens are issued exactly like any other user), then its role is
 * flipped to "admin". Because `protect` reloads the user from the database on
 * every request, the already-issued access token immediately grants admin
 * access even though its JWT payload still says "user".
 */
const createAdminUser = async (app, overrides = {}) => {
  const registered = await registerUser(app, overrides);

  const user = await prisma.user.update({
    where: { id: registered.user.id },
    data: { role: 'admin' },
  });

  return { ...registered, user };
};

module.exports = { createAdminUser };