import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { closeDb, db } from './index.js';

try {
  await migrate(db, { migrationsFolder: './drizzle' });
  console.log('Migrations applied.');
} catch (error) {
  console.error('Migration failed:', error);
  process.exitCode = 1;
} finally {
  await closeDb();
}
