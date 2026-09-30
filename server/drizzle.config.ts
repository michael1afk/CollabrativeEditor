import { defineConfig } from 'drizzle-kit';

const DATABASE_URL =
  process.env['DATABASE_URL'] ??
  'postgres://collab:collab@localhost:5432/collab';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: DATABASE_URL },
  strict: true,
  verbose: true,
});
