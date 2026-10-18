import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {characterFiles} from '@/lib/characters';
import {wardrobeCatalog} from '@/lib/points-types';
import {spaceCatalog, defaultRoom, starterSpaceIds} from './catalog';
import {validateRoom} from './policy';
import {avatarPet, wearablePets, wearStates, wearState, wornSprite, accessoryArt, accessoryFit} from './appearance';
import {accessoryAspect} from './wearable-metrics';

test('all twelve character identities resolve without confusing the six cat breeds', () => {
  assert.equal(wearablePets.length, 12);
  for (const [species, file] of Object.entries(characterFiles)) assert.equal(avatarPet(species, `/characters/${file}.webp`), `friend-${species}`);
  for (const pet of wearablePets.filter(s => s.startsWith('cat-'))) assert.equal(avatarPet('cat', `/my-space/v1/${pet}.webp`), pet);
  for (const bad of ['__proto__', 'constructor', 'unknown']) assert.equal(avatarPet(bad), 'friend-cat');
  assert.equal(wearState({body: '__proto__', bag: 'invented'}), 'bare');
});
test('every friend can wear all eight owned outfits with and without the bag: 216 complete sprites', () => {
  const clothes = spaceCatalog.filter(s => s.kind === 'clothes' && s.slot === 'body');
  assert.equal(clothes.length, 8); assert.equal(wearStates.length, 18);
  const all = new Set<string>();
  for (const pet of wearablePets) for (const body of [undefined, ...clothes.map(s => s.id)]) for (const bag of [undefined, 'bag-leaf']) {
    const outfit = {body, bag}, src = wornSprite(pet, outfit);
    assert(existsSync('public' + src), src); all.add(src);
    const room = {...defaultRoom(), pet, outfit};
    assert.deepEqual(validateRoom(room, [...starterSpaceIds, pet, ...clothes.map(s => s.id), 'bag-leaf']).outfit, Object.fromEntries(Object.entries(outfit).filter(([,v]) => v)));
    if (body) assert.throws(() => validateRoom(room, [...starterSpaceIds, pet, 'bag-leaf']));
  }
  assert.equal(all.size, 216);
});
test('6480 head/neck/body/bag combinations use bounded registered layers and bundled art', () => {
  const heads = [undefined, ...wardrobeCatalog.filter(i => i.slot === 'head').map(i => i.id)], necks = [undefined, ...wardrobeCatalog.filter(i => i.slot === 'neck').map(i => i.id)];
  let cases = 0;
  for (const pet of wearablePets) for (const state of wearStates) for (const head of heads) for (const neck of necks) {
    cases++; assert(state);
    for (const id of [head, neck].filter((v): v is string => !!v)) {
      const src = accessoryArt(id, pet)!; assert(existsSync('public' + src));
      const f = accessoryFit(pet, id), ratio = accessoryAspect[`${pet.startsWith('cat-') ? 'fur' : 'soft'}/${id}`];
      assert(f.left >= 0 && f.top >= 0 && f.width > 0 && f.left + f.width <= 100 && f.top + f.width / ratio <= 100, `${pet} ${id}`);
    }
  }
  assert.equal(cases, 6480);
});
test('the wardrobe asset manifest is complete, immutable and matches all 234 actual files', () => {
  const m = JSON.parse(readFileSync('public/my-space/v2/wardrobe/manifest.json', 'utf8'));
  assert.equal(m.assets.length, 234); assert.equal(new Set(m.assets.map((a: any) => a.url)).size, 234);
  for (const a of m.assets) {
    const bytes = readFileSync('public' + a.url); assert.equal(a.alpha, true); assert.equal(bytes.length, a.bytes); assert.equal(createHash('sha256').update(bytes).digest('hex'), a.sha256);
  }
});
