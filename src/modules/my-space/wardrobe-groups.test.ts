import test from 'node:test';
import assert from 'node:assert/strict';
import {wardrobeGroups, groupFriends, petWardrobeGroup, previewFriend, friendName, itemFriends} from './wardrobe-groups';

test('the three wardrobes preserve the classic and fluffy groups and isolate Whiteknee', () => {
  assert.equal(wardrobeGroups.length, 3);
  assert.equal(groupFriends('classic').length, 12);
  assert.equal(groupFriends('fluffy').length, 10);
  assert.deepEqual(groupFriends('whiteknee').map(pet => pet.id), ['animal-whiteknee']);
  assert.equal(petWardrobeGroup('friend-dog'), 'classic');
  assert.equal(petWardrobeGroup('cat-maine'), 'classic');
  assert.equal(petWardrobeGroup('dog-corgi'), 'fluffy');
  assert.equal(petWardrobeGroup('animal-whiteknee'), 'whiteknee');
  assert.equal(itemFriends({id: 'body-knit', kind: 'clothes', slot: 'body'}).length, 12);
  assert.equal(itemFriends({id: 'junior-head-crown', kind: 'accessory', slot: 'head'}).length, 10);
  assert.deepEqual(itemFriends({id: 'whiteknee-body-explorer', kind: 'clothes', slot: 'body'}).map(pet => pet.id), ['animal-whiteknee']);
  assert.deepEqual(itemFriends({id: 'whiteknee-face-goggles', kind: 'accessory', slot: 'face'}).map(pet => pet.id), ['animal-whiteknee']);
  assert.deepEqual(itemFriends({id: 'bed', kind: 'furniture'}), []);
});

test('preview models prefer the active friend, then owned friends, and accept a separate browsing model', () => {
  assert.equal(previewFriend('classic', 'friend-dog', []).id, 'friend-dog');
  assert.equal(previewFriend('fluffy', 'friend-dog', ['animal-penguin']).id, 'animal-penguin');
  assert.equal(previewFriend('fluffy', 'friend-dog', []).id, 'dog-bichon');
  assert.equal(previewFriend('classic', 'friend-dog', [], 'friend-cat').id, 'friend-cat');
  assert.equal(previewFriend('classic', 'friend-dog', [], 'dog-corgi').id, 'friend-dog');
  assert.equal(friendName(previewFriend('classic', 'friend-dog', [])), '두부');
  assert.equal(friendName(previewFriend('fluffy', 'friend-dog', [])), '뽀송');
  assert.equal(previewFriend('whiteknee', 'friend-dog', []).id, 'animal-whiteknee');
  assert.equal(previewFriend('classic', 'animal-whiteknee', [], 'animal-whiteknee').id, 'friend-cat');
});
