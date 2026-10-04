import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

// Prisma CLI configuration (Prisma ORM v7).
// The datasource URL lives here now, instead of in schema.prisma.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
