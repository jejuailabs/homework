import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {seahorsePets, seahorseSetItems, seahorseBodyItems, seahorseAccessoryItems, seahorseSprite, seahorseAccessoryArt} from './seahorse';
import {exclusiveItemCompatible} from './wardrobe-compatibility';
import {compatibleWearable} from './new-pets';
import {avatarPet, wornSprite} from './appearance';
import {spaceItem, starterSpaceIds, defaultRoom} from './catalog';
import {ownedItems, validateRoom, roomCompanionAppearance} from './policy';
import {companionProfile} from './profile';
import {groupFriends, itemFriends, petWardrobeGroup} from './wardrobe-groups';

const [yellow, purple] = seahorsePets;
const owned = [...starterSpaceIds, ...seahorsePets.map(pet => pet.id), ...seahorseSetItems.map(item => item.id)];

test('both seahorses share 20 complete looks with separate clothing/accessory descriptions', () => {
  assert.equal(seahorseSetItems.length, 20);
  assert.equal(new Set(seahorseSetItems.map(item => item.id)).size, 20);
  assert.deepEqual(groupFriends('seahorse').map(pet => pet.id), seahorsePets.map(pet => pet.id));
  for (const pet of seahorsePets) {
    assert.equal(spaceItem(pet.id)?.price, 60);
    assert.equal(petWardrobeGroup(pet.id), 'seahorse');
    assert.equal(avatarPet('otter', seahorseSprite(pet.id)), pet.id);
    assert.equal(avatarPet('otter', `/my-space/seahorse/v1/${pet.id}/poses/rest/bare.webp`), pet.id);
    for (const set of seahorseSetItems) {
      assert(set.clothes && set.accessories);
      assert.equal(wornSprite(pet.id, {body: set.id}, 'raised'), `/my-space/seahorse/v2/${pet.id}/${set.motif}.webp`);
      assert.equal(compatibleWearable(pet.id, set), true);
      assert.deepEqual(itemFriends(set).map(pet => pet.id), [yellow.id, purple.id]);
      for (const other of ['friend-cat', 'animal-whiteknee', 'dog-bichon']) assert.equal(exclusiveItemCompatible(other, set), false);
    }
  }
  for (const item of [...seahorseBodyItems, ...seahorseAccessoryItems]) {
    assert.equal(compatibleWearable(yellow.id, item), false, item.id);
    assert.equal(seahorseAccessoryArt(item.id, yellow.id), undefined);
  }
});

test('a complete look survives save/reload and switching pets, and basic clears the set', () => {
  const room = {...defaultRoom(), pet: yellow.id, pose: 'raised', outfit: {body: 'seahorse-set-dreamy'}, nicknames: {[yellow.id]: '반짝이'}};
  const saved = validateRoom(room, owned);
  const reloaded = companionProfile({spaceOwned: owned}, JSON.parse(JSON.stringify(saved)));
  assert.equal(reloaded?.pose, 'rest'); assert.equal(reloaded?.name, '반짝이');
  assert.deepEqual(reloaded?.outfit, room.outfit);
  assert.deepEqual(roomCompanionAppearance(saved, owned, purple.id).outfit, room.outfit);
  assert.deepEqual(roomCompanionAppearance(saved, owned, 'friend-cat').outfit, {});
  assert.deepEqual(validateRoom({...room, outfit: {}}, owned).outfit, {});
  assert.throws(() => validateRoom(room, [...starterSpaceIds, yellow.id]));
  assert.throws(() => validateRoom({...room, pose: 'flying'}, owned));
  assert.throws(() => validateRoom({...room, outfit: {body: 'body-knit'}}, [...owned, 'body-knit'], yellow.id));
});

test('legacy purchases unlock matching complete looks without losing ownership', () => {
  const items = ownedItems([yellow.id, 'seahorse-body-pajamas'], ['seahorse-face-glasses']);
  assert(items.includes('seahorse-body-pajamas'));
  assert(items.includes('seahorse-set-dreamy')); assert(items.includes('seahorse-set-scholar'));
  const room = {...defaultRoom(), pet: yellow.id, outfit: {body: 'seahorse-body-pajamas'}};
  assert.equal(validateRoom(room, items).outfit.body, 'seahorse-set-dreamy');
  assert.equal(companionProfile({spaceOwned: [yellow.id], wardrobeOwned: ['seahorse-face-glasses'], wardrobeOutfit: {face: 'seahorse-face-glasses'}}, {...room, outfit: {}})?.outfit.body, 'seahorse-set-scholar');
  assert.equal(companionProfile({spaceOwned: [yellow.id], wardrobeOwned: []}, {...room, outfit: {}})?.outfit.body, undefined);
});

test('42 production sprites are unique and match the versioned manifest', () => {
  const manifest = JSON.parse(fs.readFileSync('public/my-space/seahorse/v2/manifest.json', 'utf8'));
  assert.equal(manifest.files.length, 42);
  assert.equal(new Set(manifest.files.map((f: {sha256: string}) => f.sha256)).size, 42);
  const paths = new Set(manifest.files.map((f: {path: string}) => f.path));
  for (const file of manifest.files) {
    const bytes = fs.readFileSync('public' + file.path);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, file.path);
    assert.equal(bytes.length, file.bytes); assert.equal(file.width, 768); assert.equal(file.height, 768);
  }
  for (const pet of seahorsePets) {
    assert(fs.existsSync(`public/my-space/seahorse/v2/sheets/${pet.id}.png`));
    for (const body of [undefined, ...seahorseSetItems.map(item => item.id)]) assert(paths.has(seahorseSprite(pet.id, 'rest', body)));
  }
});
