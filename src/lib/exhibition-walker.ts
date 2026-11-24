import storage from '@/data/exhibition-walker-storage.json';
import {characterFiles, type Character} from './characters';

/** File name of each 3D walker. Every pet a pupil can pick in My Space has one, all with a single `walk` clip. */
const WALKER_FILES: Record<string, string> = {
  ...Object.fromEntries((Object.keys(characterFiles) as Character[]).map(base => ['friend-' + base, 'friend-' + characterFiles[base]])),
  'berry-blue': 'berry-blue-jerry', 'berry-rasp': 'berry-rasp-jurry',
  ...Object.fromEntries([
    'cat-american', 'cat-british', 'cat-maine', 'cat-persian', 'cat-ragdoll', 'cat-siamese',
    'dog-bichon', 'dog-corgi', 'dog-dachshund', 'dog-maltipoo', 'dog-pomeranian',
    'animal-fennec', 'animal-red-panda', 'animal-penguin', 'animal-seal', 'fantasy-cloud-dragon',
    'animal-crab-butter', 'animal-crab-lilac', 'animal-dolphin-blue', 'animal-dolphin-pink',
    'animal-jellyfish-lilac', 'animal-jellyfish-rainbow', 'animal-seahorse-butter', 'animal-seahorse-lilac', 'animal-whiteknee',
  ].map(id => [id, id])),
};
export const walkerPetIds = Object.keys(WALKER_FILES);

/** The friend that walks for a pupil: the pet chosen in My Space, else the basic friend picked at sign-up. */
export function walkerPet(pet: string | null | undefined, character: string | null | undefined) {
  return pet && Object.hasOwn(WALKER_FILES, pet) ? pet : 'friend-' + (character && Object.hasOwn(characterFiles, character) ? character : 'cat');
}

/**
 * Address of a visitor's model, or null to keep the built-in cat (no pet, unknown pet, models not uploaded yet).
 * Models live in Firebase Storage like the other exhibition assets; nothing ships with the app.
 */
export function walkerModelUrl(pet: string | null | undefined) {
  const file = pet && Object.hasOwn(WALKER_FILES, pet) ? WALKER_FILES[pet] : undefined;
  if (!file) return null;
  const override = process.env.NEXT_PUBLIC_EXHIBITION_WALKER_ASSET_BASE;
  if (override) return `${override.replace(/\/$/, '')}/${file}.glb`;
  if (!storage.ready || !storage.bucket) return null;
  return `https://firebasestorage.googleapis.com/v0/b/${storage.bucket}/o/${encodeURIComponent(`${storage.prefix}/${file}.glb`)}?alt=media&token=${storage.downloadToken}`;
}
