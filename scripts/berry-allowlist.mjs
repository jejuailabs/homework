import { existsSync } from 'node:fs';
import { applicationDefault, cert, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

// Admits a teacher to the Berry connector pilot (featureAccess/berryConnector).
// Usage: node scripts/berry-allowlist.mjs --email teacher@example.com [--mode allowlist|all|off] [--remove]
if (existsSync('.env.local')) process.loadEnvFile('.env.local');
const arg = name => { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : null; };
const email = arg('--email'), mode = arg('--mode'), remove = process.argv.includes('--remove');
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || (mode && !['allowlist', 'all', 'off'].includes(mode))) {
  console.error('Usage: node scripts/berry-allowlist.mjs --email teacher@example.com [--mode allowlist|all|off] [--remove]');
  process.exit(1);
}
try {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const app = initializeApp({ credential: raw ? cert(JSON.parse(raw)) : applicationDefault(), projectId: process.env.FIREBASE_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? 'book-9b8ce' });
  const user = await getAuth(app).getUserByEmail(email);
  if (!user.emailVerified || user.disabled || !user.providerData.some(provider => provider.providerId === 'google.com')) throw new Error('The account must first sign in through Google, be email-verified, and be enabled.');
  const db = getFirestore(app), ref = db.doc('featureAccess/berryConnector');
  const current = (await ref.get()).data() ?? {};
  const uids = new Set(Array.isArray(current.teacherUids) ? current.teacherUids : []);
  if (remove) uids.delete(user.uid); else uids.add(user.uid);
  const next = { mode: mode ?? (current.mode === 'all' || current.mode === 'off' ? current.mode : 'allowlist'), teacherUids: [...uids], updatedAt: new Date().toISOString(), source: 'berry-allowlist' };
  const batch = db.batch();
  batch.set(ref, next, { merge: true });
  batch.create(db.collection('adminAudit').doc(), { actorUid: 'berry-allowlist-script', action: remove ? 'berry.allowlist.remove' : 'berry.allowlist.add', target: user.uid, details: { mode: next.mode, count: uids.size }, createdAt: new Date().toISOString() });
  await batch.commit();
  console.log(`featureAccess/berryConnector: mode=${next.mode}, teachers=${uids.size} (${remove ? 'removed' : 'added'} ${user.email}).`);
} catch (error) {
  // Never print SDK payloads or credential material.
  console.error('Allowlist update failed:', error.code ?? (error.message?.startsWith('The account') ? error.message : 'Check account existence, credentials, and project permissions.'));
  process.exitCode = 1;
}
