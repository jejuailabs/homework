import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {berryPets, berrySetItems, berrySprite, berryStates, berryObject, BERRY_STORAGE} from './berry';
import {compatibleWearable, supportsSharedWearables} from './new-pets';
import {avatarPet, wornSprite} from './appearance';
import {defaultRoom, starterSpaceIds, spaceItem} from './catalog';
import {validateRoom} from './policy';
import {companionProfile} from './profile';
import {groupFriends, itemFriends, petWardrobeGroup} from './wardrobe-groups';

test('Jerry and Jurry share 16 complete sets that no other friend can wear', () => {
  assert.deepEqual(berryPets.map(p => p.buddyName), ['제리', '주리']);
  assert.equal(berrySetItems.length, 16);
  assert.equal(groupFriends('berry').length, 2);
  for (const pet of berryPets) {
    assert.equal(spaceItem(pet.id)?.price, 60);
    assert.equal(petWardrobeGroup(pet.id), 'berry');
    assert.equal(supportsSharedWearables(pet.id), false);
    assert.equal(avatarPet('hamster', berrySprite(pet.id)), pet.id);
    for (const set of berrySetItems) {
      assert(set.price >= 35 && set.price <= 50);
      assert(set.looks[pet.id].clothes && set.looks[pet.id].accessories);
      assert.equal(compatibleWearable(pet.id, set), true);
      assert.equal(wornSprite(pet.id, {body: set.id}), berrySprite(pet.id, set.id));
      assert.notEqual(berrySprite(pet.id, set.id), berrySprite(pet.id));
      assert.equal(itemFriends(set).length, 2);
      for (const other of ['friend-cat', 'dog-corgi', 'animal-whiteknee', 'animal-seahorse-butter', 'animal-dolphin-blue']) assert.equal(compatibleWearable(other, set), false);
    }
    for (const foreign of ['body-knit', 'junior-body-knit', 'seahorse-set-scholar', 'dolphin-set-scholar', 'whiteknee-body-chef']) assert.equal(compatibleWearable(pet.id, {id: foreign, slot: 'body'}), false);
    assert.equal(berrySprite(pet.id, 'dolphin-set-scholar'), berrySprite(pet.id));
  }
});
test('owned berry sets persist on profiles, reject foreign clothing, and clear to basic', () => {
  const owned = [...starterSpaceIds, ...berryPets.map(p => p.id), ...berrySetItems.map(s => s.id), 'dolphin-set-scholar'];
  for (const pet of berryPets) {
    const room = {...defaultRoom(), pet: pet.id, outfit: {body: 'berry-set-haenyeo'}};
    const saved = validateRoom(room, owned, pet.id);
    const profile = companionProfile({spaceOwned: owned}, saved);
    assert.equal(profile?.outfit.body, 'berry-set-haenyeo');
    assert.equal(profile?.art, berrySprite(pet.id));
    assert.deepEqual(validateRoom({...room, outfit: {}}, owned, pet.id).outfit, {});
    assert.throws(() => validateRoom({...room, outfit: {body: 'dolphin-set-scholar'}}, owned, pet.id));
    assert.throws(() => validateRoom(room, [...starterSpaceIds, pet.id], pet.id));
  }
});
test('34 sprites are recorded for Firebase Storage and none ship in the app', () => {
  const manifest = JSON.parse(fs.readFileSync('docs/berry-pet-assets.json', 'utf8'));
  assert.equal(manifest.files.length, 34);
  assert.equal(new Set(manifest.files.map((f: {sha256: string}) => f.sha256)).size, 34);
  const paths = new Set(manifest.files.map((f: {path: string}) => f.path));
  for (const pet of berryPets) for (const state of berryStates) assert(paths.has(berryObject(pet.id, state)));
  for (const file of manifest.files) {assert.equal(file.width, 512); assert.equal(file.height, 512);}
  assert(BERRY_STORAGE.bucket && BERRY_STORAGE.token);
  assert.equal(new URL(berrySprite('berry-blue')).origin, 'https://firebasestorage.googleapis.com');
  assert.equal(fs.existsSync('public/my-space/berry'), false);
});
