import storage from '@/data/ocean-exhibition-storage.json';
import data from './data.json';

/** Ocean-mode rooms (산호 · 켈프 · 심해 · 라군). Classic rooms keep cozy/forest/sky/ocean. */
export const OCEAN_THEMES = ['coral', 'kelp', 'abyss', 'lagoon'] as const;
export type OceanTheme = typeof OCEAN_THEMES[number];
export const isOceanTheme = (value: unknown): value is OceanTheme => OCEAN_THEMES.includes(value as OceanTheme);

export const OCEAN_THEME_TEXT: Record<OceanTheme, {ko: string; en: string; koHint: string; enHint: string}> = {
  coral: {ko: '산호 아치관', en: 'Coral arch gallery', koHint: '테라코타 아치와 산호 정원', enHint: 'Terracotta arches in a coral garden'},
  kelp: {ko: '켈프 회랑관', en: 'Kelp corridor gallery', koHint: '금빛 빛줄기가 내려오는 해중림', enHint: 'A golden kelp forest corridor'},
  abyss: {ko: '심해 블루아이관', en: 'Deep-sea blue-eye gallery', koHint: '푸른 심해와 원형 관측창', enHint: 'Round portholes in the deep blue'},
  lagoon: {ko: '화이트 라군관', en: 'White lagoon gallery', koHint: '얕은 모래바다와 진주빛 전시관', enHint: 'Pearl rooms over a shallow lagoon'},
};

/** Textures live in Firebase Storage under one shared download token; nothing ships with the app. */
export function oceanAssetUrl(path: string) {
  const override = process.env.NEXT_PUBLIC_OCEAN_EXHIBITION_ASSET_BASE;
  if (override) return `${override.replace(/\/$/, '')}/${path}`;
  return `https://firebasestorage.googleapis.com/v0/b/${storage.bucket}/o/${encodeURIComponent(`${storage.prefix}/${path}`)}?alt=media&token=${storage.downloadToken}`;
}
/** Exterior concept picture used on the theme picker card. */
export const oceanThemePreview = (theme: OceanTheme) => oceanAssetUrl(data.themes[theme].images.preview);
