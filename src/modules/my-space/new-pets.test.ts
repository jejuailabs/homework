import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {newPets, newPetFromArt, supportsSharedWearables} from './new-pets';
import {spaceCatalog, defaultRoom, starterSpaceIds} from './catalog';
import {validateRoom} from './policy';
import {avatarPet, wornSprite, accessoryArt, isWearablePet} from './appearance';
import {friendBase, petPersonality} from './personality';

test('ten new friends have unique identities, five dog breeds, and complete transparent portraits', () => {
  assert.equal(newPets.length, 10);
  assert.equal(newPets.filter(pet => pet.id.startsWith('dog-')).length, 5);
  assert.equal(new Set(spaceCatalog.map(item => item.id)).size, spaceCatalog.length);
  const manifest = JSON.parse(readFileSync('public/my-space/v4/pets/manifest.json', 'utf8'));
  assert.equal(manifest.assets.length, 10);
  for (const pet of newPets) {
    const asset = manifest.assets.find((item: {id: string}) => item.id === pet.id);
    const bytes = readFileSync('public' + pet.art);
    assert.equal(asset.width, 512); assert.equal(asset.height, 512); assert.equal(asset.alpha, true);
    assert.equal(bytes.length, asset.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256);
    assert.equal(newPetFromArt(pet.art)?.id, pet.id);
    assert.equal(petPersonality(pet.id).name, pet.name);
    assert.equal(friendBase(pet.id), pet.base);
  }
});

test('new friends retain their own identity with inherited clothing and never use another animal’s sprite', () => {
  for (const pet of newPets) {
    assert.equal(avatarPet(pet.base, pet.art), pet.id);
    assert.equal(avatarPet(pet.id), pet.id);
    assert.equal(isWearablePet(pet.id), false);
    assert.equal(supportsSharedWearables(pet.id), false);
    for (const body of [undefined, 'body-knit', 'body-hoodie']) {
      assert.equal(wornSprite(pet.id, {body, bag: 'bag-leaf'}), pet.art);
    }
    assert.equal(accessoryArt('head-crown', pet.id), undefined);
    assert.equal(accessoryArt('neck-bow', pet.id), undefined);
  }
  assert.equal(supportsSharedWearables('friend-dog'), true);
  assert.equal(supportsSharedWearables('cat-maine'), true);
  assert.equal(newPetFromArt('/untrusted/not-a-pet.webp'), undefined);
});

test('new friends require adoption ownership and preserve existing clothes when switching friends', () => {
  for (const pet of newPets) {
    const outfit = {body: 'body-knit', bag: 'bag-leaf'};
    const room = {...defaultRoom(), pet: pet.id, outfit, nicknames: {[pet.id]: '내 친구'}};
    assert.throws(() => validateRoom(room, [...starterSpaceIds, 'body-knit', 'bag-leaf']));
    const saved = validateRoom(room, [...starterSpaceIds, pet.id, 'body-knit', 'bag-leaf']);
    assert.equal(saved.pet, pet.id);
    assert.deepEqual(saved.outfit, outfit);
    assert.equal(saved.nicknames[pet.id], '내 친구');
    const back = validateRoom({...saved, pet: 'friend-dog'}, [...starterSpaceIds, pet.id, 'body-knit', 'bag-leaf']);
    assert.equal(wornSprite('friend-dog', back.outfit), '/my-space/v2/wardrobe/friend-dog/knit-bag.webp');
  }
});
