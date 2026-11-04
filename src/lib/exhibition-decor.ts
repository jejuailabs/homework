/**
 * Painted decor for the exhibition village: which image each surface uses per stage and room theme, and the
 * nine-slice geometry that lets a square frame image wrap any picture size without stretching its corners.
 * Images live in public/exhibition-world/v1 (lobby, gallery, courtyard); only the current stage and theme load.
 */
export const DECOR_BASE = '/exhibition-world/v1';
export type DecorTheme = 'cozy' | 'forest' | 'sky' | 'ocean';
export const decorThemes: DecorTheme[] = ['cozy', 'forest', 'sky', 'ocean'];
export const decorTheme = (value: unknown): DecorTheme => decorThemes.includes(value as DecorTheme) ? value as DecorTheme : 'cozy';
export const decorUrl = (name: string) => `${DECOR_BASE}/${name}.webp`;

/** World size of one texture tile, in metres, so patterns keep their scale on any wall or floor. */
export const DECOR_TILE = {wall: 2.2, floor: 2.6, ceiling: 3.2, grass: 4, path: 1.6, cushion: 0.7} as const;

export function lobbyDecor() {
  return {
    wall: 'lobby/l1', wainscot: 'lobby/l2', ceiling: 'lobby/l3', lantern: 'lobby/l4', floor: 'lobby/l5', rug: 'lobby/l6',
    view: 'lobby/l7', curtains: 'lobby/l8', poster: 'lobby/l9', plaque: 'lobby/l10', garland: 'lobby/l11',
    stickers: ['lobby/l12-puffy-star', 'lobby/l12-small-heart', 'lobby/l12-mini-rainbow', 'lobby/l12-stubby-crayon', 'lobby/l12-pencil', 'lobby/l12-paw-print'],
    plant: 'lobby/l13', pots: ['lobby/l14-round-succulent', 'lobby/l14-tiny-daisy-pot', 'lobby/l14-trailing-pothos'], shelf: 'lobby/l15', light: 'lobby/l16',
  };
}

const gallerySticker: Record<DecorTheme, string[]> = {
  cozy: ['flower', 'heart', 'crayon', 'star', 'sun'], forest: ['leaf', 'acorn', 'mushroom', 'butterfly', 'pinecone'],
  sky: ['cloud', 'star', 'moon', 'rainbow', 'kite'], ocean: ['shell', 'starfish', 'bubble', 'fish', 'wave'],
};
export function galleryDecor(value: unknown) {
  const theme = decorTheme(value);
  return {
    wall: `gallery/g1-${theme}`, wainscot: `gallery/g2-${theme}`, crown: `gallery/g3-${theme}`, ceiling: `gallery/g4-${theme}`, floor: `gallery/g5-${theme}`,
    rug: `gallery/g6-${theme}`, frame: `gallery/g7-${theme}`, caption: 'gallery/g8', plaque: `gallery/g9-${theme}`, screen: 'gallery/g10', cushion: 'gallery/g11',
    plant: `gallery/g12-${theme}`, mobile: `gallery/g13-${theme}`, stickers: gallerySticker[theme].map(name => `gallery/g14-${theme}-${name}`), spotlight: 'gallery/g15',
  };
}

export function courtyardDecor() {
  return {sky: 'courtyard/c1', grass: 'courtyard/c2', path: 'courtyard/c3', bushes: ['courtyard/c4-round-trimmed-bush', 'courtyard/c4-pastel-tulips', 'courtyard/c4-flowering-hedge']};
}

/**
 * Corner and edge widths of each frame image, as a share of the image (UV) and in world metres. The painted band
 * keeps its world width while the plain middle stretches.
 */
export const DECOR_SLICES = {
  poster: {u: 0.17, v: 0.17, border: 0.3},
  frame: {u: 0.24, v: 0.24, border: 0.26},
  screen: {u: 0.2, v: 0.2, border: 0.36},
  // Plaques stretch only in the middle of their length: left and right caps keep their shape.
  lobbyPlaque: {u: 0.24, v: 0, border: 0},
  galleryPlaque: {u: 0.3, v: 0, border: 0},
} as const;

/**
 * A w × h quad split 3 × 3 so the outer band keeps `bx`/`by` metres and UV `ux`/`uy`, centred on the origin.
 * Returns flat position (x, y, 0), uv and index arrays for a BufferGeometry.
 */
export function nineSlice(w: number, h: number, bx: number, by: number, ux: number, uy: number) {
  const x = [0, Math.min(bx, w / 2), Math.max(w - bx, w / 2), w].map(v => v - w / 2);
  const y = [0, Math.min(by, h / 2), Math.max(h - by, h / 2), h].map(v => v - h / 2);
  const u = [0, ux, 1 - ux, 1], v = [0, uy, 1 - uy, 1];
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) {positions.push(x[col], y[row], 0); uvs.push(u[col], v[row]);}
  for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
    const a = row * 4 + col, b = a + 1, c = a + 4, d = c + 1;
    indices.push(a, b, d, a, d, c);
  }
  return {positions, uvs, indices};
}

/** Plaque size for a title: caps keep the image's proportions at height `h`, the middle grows to fit the text. */
export function plaqueSize(textWidth: number, h: number, capShare: number) {
  const cap = h * capShare;
  return {width: textWidth + cap * 2 * 0.85, height: h, cap};
}
