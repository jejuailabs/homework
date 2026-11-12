import storage from '@/data/space-exhibition-storage.json';

/** Space-mode rooms (지구 궤도 · 달 분화구 · 토성 고리). Classic rooms keep cozy/forest/sky/ocean. */
export const SPACE_THEMES = ['earth', 'moon', 'saturn'] as const;
export type SpaceTheme = typeof SPACE_THEMES[number];
export const isSpaceTheme = (value: unknown): value is SpaceTheme => SPACE_THEMES.includes(value as SpaceTheme);

export const SPACE_THEME_TEXT: Record<SpaceTheme, {ko: string; en: string; koHint: string; enHint: string}> = {
  earth: {ko: '지구 궤도 관측실', en: 'Earth orbit observatory', koHint: '지구가 내려다보이는 관측창 전시실', enHint: 'A gallery above the Earth'},
  moon: {ko: '달 분화구 아래 미술관', en: 'Gallery beneath a lunar crater', koHint: '천창 아래 둥근 달 전시실', enHint: 'A domed room under the Moon'},
  saturn: {ko: '토성 고리 회랑', en: 'Saturn ring promenade', koHint: '토성을 바라보며 걷는 고리 회랑', enHint: 'A ring walk facing Saturn'},
};

const COMMON = ['exterior', 'hub', 'gallery', 'shell', 'floor', 'trim', 'ceiling', 'window', 'bench', 'door', 'light', 'panel', 'frame', 'exteriorHull', 'tread', 'terrain', 'rail', 'sky', 'portalSkin', 'artBay', 'roomView', 'exteriorBay'];
const KEYS: Record<SpaceTheme, string[]> = {earth: [...COMMON, 'globe', 'starfield'], moon: COMMON, saturn: COMMON};

/** Textures live in Firebase Storage under one shared download token; nothing ships with the app. */
export function spaceAssetUrl(path: string) {
  const override = process.env.NEXT_PUBLIC_SPACE_EXHIBITION_ASSET_BASE;
  if (override) return `${override.replace(/\/$/, '')}/${path}`;
  return `https://firebasestorage.googleapis.com/v0/b/${storage.bucket}/o/${encodeURIComponent(`${storage.prefix}/${path}`)}?alt=media&token=${storage.downloadToken}`;
}
export function spaceThemeImages(theme: SpaceTheme) {
  return Object.fromEntries(KEYS[theme].map(key => [key, spaceAssetUrl(`${theme}/${key}.webp`)]));
}
export const spaceCatUrl = () => spaceAssetUrl('character/cat.webp');
/** Exterior picture used on the theme picker card. */
export const spaceThemePreview = (theme: SpaceTheme) => spaceAssetUrl(`${theme}/exterior.webp`);
