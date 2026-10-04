/**
 * Admin seed script.
 *
 * Creates (or promotes) the single administrator account described by the
 * ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_NAME environment variables.
 *
 * Run with:  npm run seed:admin
 */

require('dotenv').config();

const bcrypt = require('bcryptjs');

const prisma = require('../src/config/prisma');

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@example.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'AdminPass123!';
const ADMIN_NAME = process.env.ADMIN_NAME || 'Super Admin';

const seedAdmin = async () => {
  const existing = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });

  // Already registered: make sure the account holds the admin role.
  if (existing) {
    const updated = await prisma.user.update({
      where: { id: existing.id },
      data: { role: 'admin', name: existing.name || ADMIN_NAME },
    });

    console.log('Updated existing user to admin');
    return updated;
  }

  const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 10);

  const user = await prisma.user.create({
    data: {
      email: ADMIN_EMAIL,
      password: hashedPassword,
      name: ADMIN_NAME,
      role: 'admin',
    },
  });

  console.log(`Created admin user: ${ADMIN_EMAIL}`);
  return user;
};

seedAdmin()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error('Failed to seed admin user:', error);
    await prisma.$disconnect();
    process.exit(1);
  });