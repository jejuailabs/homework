import storage from '@/data/berry-brand-storage.json';

/** BERRY DUO brand art lives in Firebase Storage (scripts/upload-berry-brand-assets.mjs); nothing ships with the app. */
export function berryAssetUrl(name: string) {
  return `https://firebasestorage.googleapis.com/v0/b/${storage.bucket}/o/${encodeURIComponent(`${storage.prefix}/${name}.webp`)}?alt=media&token=${storage.downloadToken}`;
}
