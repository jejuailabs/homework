import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {seahorsePets, seahorseBodyItems, seahorseAccessoryItems, seahorseSprite, seahorseAccessoryArt} from './seahorse';
import {seahorseAccessoryLayout} from './seahorse-layout';
import {exclusiveItemCompatible} from './wardrobe-compatibility';
import {compatibleWearable} from './new-pets';
import {avatarPet, wornSprite} from './appearance';
import {spaceItem, starterSpaceIds, defaultRoom} from './catalog';
import {validateRoom, roomCompanionAppearance} from './policy';
import {companionProfile} from './profile';
import {groupFriends, itemFriends, petWardrobeGroup} from './wardrobe-groups';

const [yellow, purple] = seahorsePets;
const owned = [...starterSpaceIds, ...seahorsePets.map(pet => pet.id), ...seahorseBodyItems.map(item => item.id)];
test('both seahorses use their own bare artwork and share one dedicated wardrobe', () => {
  assert.deepEqual(groupFriends('seahorse').map(pet => pet.id), seahorsePets.map(pet => pet.id));
  for (const pet of seahorsePets) {
    assert.equal(spaceItem(pet.id)?.price, 60);
    assert.equal(petWardrobeGroup(pet.id), 'seahorse');
    assert.equal(avatarPet('otter', seahorseSprite(pet.id)), pet.id);
    assert.equal(avatarPet(pet.id), pet.id);
    assert.equal(wornSprite(pet.id, {body: 'seahorse-body-overalls'}, 'raised'), seahorseSprite(pet.id, 'raised', 'seahorse-body-overalls'));
  }
  for (const item of [...seahorseBodyItems, ...seahorseAccessoryItems]) {
    assert.deepEqual(itemFriends({...item, kind: 'slot' in item && item.slot !== 'body' ? 'accessory' : 'clothes'}).map(pet => pet.id), [yellow.id, purple.id]);
    for (const pet of [yellow.id, purple.id, 'animal-whiteknee', 'friend-cat', 'dog-bichon']) {
      const expected = pet === yellow.id || pet === purple.id;
      assert.equal(compatibleWearable(pet, item), expected);
      assert.equal(exclusiveItemCompatible(pet, item), expected);
    }
  }
  assert.equal(seahorseAccessoryArt('seahorse-../../secret', yellow.id), undefined);
  assert.equal(seahorseAccessoryLayout('friend-cat', 'seahorse-face-glasses'), null);
});

test('seahorse poses and shared clothing survive save, reload and companion switches', () => {
  const room = {...defaultRoom(), pet: yellow.id, pose: 'raised', outfit: {body: 'seahorse-body-pajamas'}, nicknames: {[yellow.id]: '반짝이'}};
  const saved = validateRoom(room, owned);
  const reloaded = companionProfile({spaceOwned: owned}, JSON.parse(JSON.stringify(saved)));
  assert.equal(reloaded?.pet, yellow.id);assert.equal(reloaded?.pose, 'raised');assert.equal(reloaded?.name, '반짝이');
  assert.deepEqual(reloaded?.outfit, room.outfit);
  const switched = roomCompanionAppearance(saved, owned, purple.id);
  assert.equal(switched.pose, 'raised');assert.deepEqual(switched.outfit, room.outfit);
  assert.deepEqual(roomCompanionAppearance(saved, owned, 'friend-cat').outfit, {});
  assert.deepEqual(validateRoom({...room, outfit: {body: 'body-knit'}}, [...owned, 'body-knit'], 'friend-cat').outfit, {});
  assert.throws(() => validateRoom({...room, outfit: {body: 'body-knit'}}, [...owned, 'body-knit'], yellow.id));
  assert.throws(() => validateRoom(room, [...starterSpaceIds, yellow.id]));
  assert.throws(() => validateRoom({...room, pose: 'flying'}, owned));
  assert.equal(validateRoom({...room, pose: undefined}, owned).pose, 'rest');
});

test('36 production sprites are unique, versioned and match their recorded hashes', () => {
  const manifest = JSON.parse(fs.readFileSync('public/my-space/seahorse/v1/manifest.json', 'utf8'));
  assert.equal(manifest.files.length, 36);
  assert.equal(new Set(manifest.files.map((f: {path: string}) => f.path)).size, 36);
  const paths = new Set(manifest.files.map((f: {path: string}) => f.path));
  for (const file of manifest.files) {
    const bytes = fs.readFileSync('public' + file.path);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, file.path);
    assert.equal(bytes.length, file.bytes);assert(file.width > 20 && file.height > 20);
  }
  for (const pet of seahorsePets) for (const pose of ['rest', 'raised']) for (const body of [undefined, ...seahorseBodyItems.map(item => item.id)]) {
    assert(paths.has(seahorseSprite(pet.id, pose, body)));
    for (const accessory of seahorseAccessoryItems) {
      assert(paths.has(seahorseAccessoryArt(accessory.id, pet.id)));
      const f = seahorseAccessoryLayout(pet.id, accessory.id, pose, body)!;
      assert(f, `${pet.id}/${pose}/${body}/${accessory.id}`);
      const left = f.x - f.width * f.pivotX / 100, top = f.y - f.height * f.pivotY / 100;
      assert(left >= 0 && top >= 0 && left + f.width <= 100 && top + f.height <= 100, accessory.id);
    }
  }
});
