import { existsSync } from 'node:fs';
import { applicationDefault, cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Chooses where new compressed homework videos are stored (runtimeConfig/videoProcessing.outputStorage).
// Usage: npm run video:storage -- r2|google   (no argument prints the current setting)
// Takes effect on the next video submission; no deploy is needed. Existing videos stay where they are.
if (existsSync('.env.local')) process.loadEnvFile('.env.local');
const target = process.argv[2];
if (target && !['r2', 'google'].includes(target)) {
  console.error('Usage: npm run video:storage -- r2|google');
  process.exit(1);
}
try {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const app = initializeApp({ credential: raw ? cert(JSON.parse(raw)) : applicationDefault(), projectId: process.env.FIREBASE_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID });
  const db = getFirestore(app), ref = db.doc('runtimeConfig/videoProcessing');
  const current = (await ref.get()).data();
  if (!current) throw new Error('runtimeConfig/videoProcessing does not exist; video processing is not set up in this project.');
  if (!target) {
    console.log(`Video storage: ${current.outputStorage === 'r2' ? 'r2' : 'google'} (processing ${current.enabled ? 'enabled' : 'disabled'}).`);
  } else {
    const batch = db.batch();
    batch.update(ref, { outputStorage: target, outputStorageUpdatedAt: new Date().toISOString() });
    batch.create(db.collection('adminAudit').doc(), { actorUid: 'video-storage-script', action: 'video.storage.switch', target, previous: current.outputStorage === 'r2' ? 'r2' : 'google', createdAt: new Date().toISOString() });
    await batch.commit();
    console.log(`Video storage switched to ${target}. New video submissions use it from now on.`);
  }
} catch (error) {
  // Never print SDK payloads or credential material.
  console.error('Video storage switch failed:', error.code ?? (error.message?.startsWith('runtimeConfig') ? error.message : 'Check credentials and project.'));
  process.exitCode = 1;
}
