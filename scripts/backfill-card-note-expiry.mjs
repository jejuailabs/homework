import { existsSync } from 'node:fs';
import { applicationDefault, cert, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

// 쪽지 1년 보관 (CARDS_SPEC §34): gives notes written before `expireAt` existed the same field, so the Firestore TTL policy
// (firestore.indexes.json, `cardNotes.expireAt` and `messages.expireAt`) can delete them. Reads already hide anything older than a
// year, so this only decides when Google removes the data. Idempotent: it only fills docs whose `expireAt` is missing.
// A message gets createdAt + 365 days; a thread gets its lastAt (or updatedAt) + 365 days.
// Dry run by default. Usage: node scripts/backfill-card-note-expiry.mjs [--apply]
// Not run as part of any build or deploy. Run it once, by hand, after the TTL policy is deployed.
if (existsSync('.env.local')) process.loadEnvFile('.env.local');
const apply = process.argv.includes('--apply');
const KEEP_MS = 365 * 86_400_000;
const expiry = value => { const at = Date.parse(String(value ?? '')); return Number.isNaN(at) ? null : Timestamp.fromMillis(at + KEEP_MS); };
try {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const app = initializeApp({ credential: raw ? cert(JSON.parse(raw)) : applicationDefault(), projectId: process.env.FIREBASE_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? 'book-9b8ce' });
  const db = getFirestore(app), writer = apply ? db.bulkWriter() : null;
  const counts = { threads: 0, messages: 0, skipped: 0 };
  let cursor = null;
  for (;;) {
    let query = db.collection('cardNotes').orderBy('__name__').limit(200);
    if (cursor) query = query.startAfter(cursor);
    const page = await query.get();
    if (page.empty) break;
    for (const thread of page.docs) {
      if (!thread.data().expireAt) {
        const at = expiry(thread.data().lastAt ?? thread.data().updatedAt);
        if (at) { counts.threads++; writer?.update(thread.ref, { expireAt: at }); } else counts.skipped++;
      }
      // Only this thread's messages: the collection group name `messages` is generic, so the script never walks it globally.
      const messages = await thread.ref.collection('messages').get();
      for (const message of messages.docs) {
        if (message.data().expireAt) continue;
        const at = expiry(message.data().createdAt);
        if (at) { counts.messages++; writer?.update(message.ref, { expireAt: at }); } else counts.skipped++;
      }
    }
    cursor = page.docs.at(-1);
  }
  await writer?.close();
  console.log(`${apply ? 'Updated' : 'Would update'} ${counts.threads} threads and ${counts.messages} messages; ${counts.skipped} without a usable time.${apply ? '' : ' Run again with --apply to write.'}`);
} catch (error) {
  // Never print SDK payloads or credential material.
  console.error('Backfill failed:', error.code ?? 'Check credentials and project permissions.');
  process.exitCode = 1;
}
