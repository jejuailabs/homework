import { existsSync } from 'node:fs';
import { applicationDefault, cert, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');
const emailIndex = process.argv.indexOf('--email');
const email = emailIndex >= 0 ? process.argv[emailIndex + 1] : null;
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error('Usage: node scripts/bootstrap-admin.mjs --email verified-google-account@example.com');
  process.exit(1);
}
try {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const app = initializeApp({ credential: raw ? cert(JSON.parse(raw)) : applicationDefault(), projectId: process.env.FIREBASE_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? 'book-9b8ce' });
  const user = await getAuth(app).getUserByEmail(email);
  if (!user.emailVerified || user.disabled || !user.providerData.some(provider => provider.providerId === 'google.com')) throw new Error('The account must first sign in through Google, be email-verified, and be enabled.');
  const db = getFirestore(app);
  const batch = db.batch();
  batch.set(db.doc(`platformRoles/${user.uid}`), { role: 'superadmin', email: user.email, grantedAt: new Date().toISOString(), source: 'bootstrap-admin' }, { merge: true });
  batch.set(db.doc(`users/${user.uid}`), { uid: user.uid, email: user.email, displayName: user.displayName ?? '', role: 'teacher', disabled: false }, { merge: true });
  batch.create(db.collection('adminAudit').doc(), { actorUid: 'bootstrap-script', action: 'role.bootstrap-superadmin', target: user.uid, createdAt: new Date().toISOString() });
  await batch.commit();
  console.log(`Superadmin granted to verified UID ${user.uid} (${user.email}).`);
} catch (error) {
  // Never print SDK payloads or credential material.
  console.error('Bootstrap failed:', error.code ?? (error.message?.startsWith('The account') ? error.message : 'Check account existence, credentials, and project permissions.'));
  process.exitCode = 1;
}
