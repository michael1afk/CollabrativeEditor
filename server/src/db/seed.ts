import { hash } from '@node-rs/argon2';
import { closeDb, db } from './index.js';
import { documentPermissions, documents, users } from './schema.js';

/**
 * A fixed id so the demo document survives re-seeding and the client can point
 * at it without a lookup. Real documents get a random uuid.
 */
export const DEMO_DOCUMENT_ID = '00000000-0000-4000-8000-000000000001';
const DEMO_USER_ID = '00000000-0000-4000-8000-0000000000a1';
const DEMO_EMAIL = 'demo@example.com';

/** The demo account's password. Development convenience only. */
const DEMO_PASSWORD = 'demo-password';

async function seed(): Promise<void> {
  const [user] = await db
    .insert(users)
    .values({
      id: DEMO_USER_ID,
      email: DEMO_EMAIL,
      passwordHash: await hash(DEMO_PASSWORD),
      displayName: 'Demo User',
      color: '#1971c2',
    })
    // The password hash is part of the update: re-seeding must bring an
    // existing demo row fully up to date, not leave a stale hash behind.
    .onConflictDoUpdate({
      target: users.email,
      set: {
        passwordHash: await hash(DEMO_PASSWORD),
        displayName: 'Demo User',
        color: '#1971c2',
        isGuest: false,
      },
    })
    .returning();

  if (!user) {
    throw new Error('failed to seed demo user');
  }

  const [document] = await db
    .insert(documents)
    .values({
      id: DEMO_DOCUMENT_ID,
      title: 'Demo Document',
      ownerId: user.id,
    })
    .onConflictDoUpdate({
      target: documents.id,
      set: { title: 'Demo Document' },
    })
    .returning();

  if (!document) {
    throw new Error('failed to seed demo document');
  }

  await db
    .insert(documentPermissions)
    .values({ documentId: document.id, userId: user.id, role: 'owner' })
    .onConflictDoUpdate({
      target: [documentPermissions.documentId, documentPermissions.userId],
      set: { role: 'owner' },
    });

  // No snapshot row is seeded: the document starts empty and the first store()
  // from Hocuspocus creates it.
  console.log('Seeded:');
  console.log(`  user     ${user.email} / ${DEMO_PASSWORD} (${user.id})`);
  console.log(`  document "${document.title}" (${document.id})`);
}

try {
  await seed();
} catch (error) {
  console.error('Seed failed:', error);
  process.exitCode = 1;
} finally {
  await closeDb();
}
