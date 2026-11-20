import storage from '@/data/berry-brand-storage.json';

/** BERRY DUO brand art lives in Firebase Storage (scripts/upload-berry-brand-assets.mjs); nothing ships with the app. */
export function berryAssetUrl(name: string) {
  return `https://firebasestorage.googleapis.com/v0/b/${storage.bucket}/o/${encodeURIComponent(`${storage.prefix}/${name}.webp`)}?alt=media&token=${storage.downloadToken}`;
}

/** 1200x630 card that messengers and search show for a shared link (scripts/upload-link-preview.mjs). */
export const LINK_PREVIEW = {
  url: `https://firebasestorage.googleapis.com/v0/b/${storage.bucket}/o/${encodeURIComponent(`${storage.prefix}/link-preview.png`)}?alt=media&token=${storage.downloadToken}`,
  width: 1200, height: 630, type: 'image/png', alt: '모두의 교실 · 숙제, 작품 전시, AI 비서 베리가 있는 우리 반 온라인 교실',
};
