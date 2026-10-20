import 'server-only';
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

function app() {
  const existing = getApps()[0];
  if (existing) return existing;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const credentialPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  // An explicit service-account key also enables local custom-token signing.
  const credential = raw ? cert(JSON.parse(raw)) : credentialPath ? cert(credentialPath) : applicationDefault();
  return initializeApp({
    credential,
    projectId: process.env.FIREBASE_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? 'book-9b8ce',
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET ?? process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? 'book-9b8ce.firebasestorage.app',
  });
}
export const auth = () => getAuth(app());
export const db = () => getFirestore(app());
export const bucket = () => getStorage(app()).bucket();
export async function cloudAccessToken() {return (await app().options.credential!.getAccessToken()).access_token;}
