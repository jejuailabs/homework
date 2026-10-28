import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultRoom, spaceItem, starterSpaceIds} from './catalog';
import {roomCompanionAppearance, validateRoom} from './policy';
import {companionProfile} from './profile';
import {WHITEKNEE_ID, normalizeWhitekneePose, whitekneeAccessoryArt, whitekneeAccessoryItems, whitekneeBodyItems, whitekneeItemCompatible, whitekneeSprite} from './whiteknee';

const owned = [...starterSpaceIds, WHITEKNEE_ID, ...whitekneeBodyItems.map(item => item.id), 'body-knit', 'bag-leaf'];

test('Whiteknee registers one friend, four outfits, eight accessories and ten full-body variants', () => {
  assert.equal(spaceItem(WHITEKNEE_ID)?.kind, 'pet');
  assert.deepEqual(whitekneeBodyItems.map(item => item.id), [
    'whiteknee-body-explorer', 'whiteknee-body-chef', 'whiteknee-body-pajamas', 'whiteknee-body-hero',
  ]);
  assert.deepEqual(whitekneeAccessoryItems.map(item => item.id), [
    'whiteknee-head-explorer', 'whiteknee-head-sprout', 'whiteknee-head-chef', 'whiteknee-head-sleep',
    'whiteknee-head-bow', 'whiteknee-neck-scarf', 'whiteknee-face-glasses', 'whiteknee-face-goggles',
  ]);
  for (const item of whitekneeBodyItems) assert.equal(spaceItem(item.id)?.slot, 'body');
  const sprites = new Set(['rest', 'raised'].flatMap(pose => [undefined, ...whitekneeBodyItems.map(item => item.id)].map(body => whitekneeSprite(pose as 'rest' | 'raised', body))));
  assert.equal(sprites.size, 10);
  assert.equal(whitekneeSprite(undefined, '__proto__'), '/my-space/whiteknee/v1/poses/rest/bare.webp');
  assert.equal(whitekneeSprite('raised', 'whiteknee-body-hero'), '/my-space/whiteknee/v1/poses/raised/hero.webp');
  assert.equal(whitekneeAccessoryArt('whiteknee-face-glasses'), '/my-space/whiteknee/v1/accessories/face-glasses.webp');
  assert.equal(whitekneeAccessoryArt('whiteknee-face-goggles'), '/my-space/whiteknee/v1/accessories/face-goggles.webp');
  assert.equal(whitekneeAccessoryArt('whiteknee-head-bow'), '/my-space/whiteknee/v1/accessories/head-bow.webp');
  assert.equal(whitekneeAccessoryArt('whiteknee-neck-scarf'), '/my-space/whiteknee/v1/accessories/neck-scarf.webp');
  assert.equal(whitekneeAccessoryArt('whiteknee-../../secret'), undefined);
});

test('superseded Whiteknee draft items cannot be selected from the current catalog contract', () => {
  assert.equal(spaceItem('whiteknee-body-raincoat'), undefined);
  assert.equal(whitekneeSprite('rest', 'whiteknee-body-raincoat'), '/my-space/whiteknee/v1/poses/rest/bare.webp');
  assert.throws(() => validateRoom({...defaultRoom(), pet: WHITEKNEE_ID, outfit: {body: 'whiteknee-body-raincoat'}}, [...owned, 'whiteknee-body-raincoat']));
  for (const id of ['whiteknee-neck-bandana', 'whiteknee-neck-bow', 'whiteknee-neck-star']) assert.equal(whitekneeAccessoryArt(id), undefined);
});

test('Whiteknee exclusivity permits shared backgrounds and frames but prevents clothing crossover', () => {
  for (const item of [...whitekneeBodyItems, ...whitekneeAccessoryItems]) {
    assert.equal(whitekneeItemCompatible(WHITEKNEE_ID, item), true);
    assert.equal(whitekneeItemCompatible('friend-cat', item), false);
  }
  for (const id of ['body-knit', 'bag-leaf', 'head-crown', 'neck-bow']) {
    assert.equal(whitekneeItemCompatible(WHITEKNEE_ID, id), false);
    assert.equal(whitekneeItemCompatible('friend-cat', id), true);
  }
  for (const id of ['background-cloud', 'frame-soft']) assert.equal(whitekneeItemCompatible(WHITEKNEE_ID, id), true);
});

test('room pose survives validation and old records acquire the resting pose', () => {
  const room = {...defaultRoom(), pet: WHITEKNEE_ID, pose: 'raised', outfit: {body: 'whiteknee-body-explorer'}};
  const saved = validateRoom(room, owned);
  assert.equal(saved.pose, 'raised');
  assert.equal(saved.outfit.body, 'whiteknee-body-explorer');
  assert.deepEqual(validateRoom(saved, owned), saved);
  assert.equal(validateRoom({...room, pose: undefined}, owned).pose, 'rest');
  assert.equal(validateRoom(defaultRoom(), starterSpaceIds).pose, 'rest');
  for (const pose of [null, 3, 'flying', '__proto__']) assert.throws(() => validateRoom({...room, pose}, owned));
  assert.equal(normalizeWhitekneePose(undefined), 'rest');
});

test('owning a wardrobe piece does not permit wearing it on the wrong pet', () => {
  assert.throws(() => validateRoom({...defaultRoom(), outfit: {body: 'whiteknee-body-chef'}}, owned), (e: any) => e.status === 403);
  assert.throws(() => validateRoom({...defaultRoom(), pet: WHITEKNEE_ID, outfit: {body: 'body-knit'}}, owned), (e: any) => e.status === 403);
  assert.throws(() => validateRoom({...defaultRoom(), pet: WHITEKNEE_ID}, starterSpaceIds), (e: any) => e.status === 403);
  assert.throws(() => validateRoom({...defaultRoom(), pet: WHITEKNEE_ID, outfit: {body: 'whiteknee-body-chef'}}, [...starterSpaceIds, WHITEKNEE_ID]), (e: any) => e.status === 403);
});

test('switching companions drops only incompatible worn clothes and preserves ownership', () => {
  const before = [...owned];
  const toWhiteknee = validateRoom({...defaultRoom(), pet: WHITEKNEE_ID, outfit: {body: 'body-knit', bag: 'bag-leaf'}}, owned, 'friend-cat');
  assert.deepEqual(toWhiteknee.outfit, {});
  const toCat = validateRoom({...defaultRoom(), outfit: {body: 'whiteknee-body-chef'}, pose: 'raised'}, owned, WHITEKNEE_ID);
  assert.deepEqual(toCat.outfit, {});
  assert.equal(toCat.pose, 'rest');
  assert.deepEqual(owned, before);
  // A forged current-pet request cannot use the migration path.
  assert.throws(() => validateRoom({...defaultRoom(), pet: WHITEKNEE_ID, outfit: {body: 'body-knit'}}, owned, WHITEKNEE_ID));
});

test('companion profile exposes the saved pose only for an actually owned pet', () => {
  const room = {...defaultRoom(), pet: WHITEKNEE_ID, pose: 'raised', nicknames: {[WHITEKNEE_ID]: '티니'}};
  const result = companionProfile({spaceOwned: [WHITEKNEE_ID]}, room);
  assert.equal(result?.pet, WHITEKNEE_ID);
  assert.equal(result?.pose, 'raised');
  assert.equal(result?.name, '티니');
  assert.equal(companionProfile({spaceOwned: []}, room), null);
});

test('the legacy character picker clears incompatible appearance before the next room save', () => {
  const room = {...defaultRoom(), pet: WHITEKNEE_ID, pose: 'raised', outfit: {body: 'whiteknee-body-hero'}};
  const ownershipBefore = [...owned];
  const changed = {...room, ...roomCompanionAppearance(room, owned, 'friend-dog')};
  assert.equal(changed.pose, 'rest');
  assert.deepEqual(changed.outfit, {});
  assert.equal(validateRoom(changed, owned, 'friend-dog').pet, 'friend-dog');
  const classic = {...defaultRoom(), outfit: {body: 'body-knit', bag: 'bag-leaf'}};
  assert.deepEqual(roomCompanionAppearance(classic, owned, 'friend-dog').outfit, classic.outfit);
  assert.deepEqual(roomCompanionAppearance(classic, owned, WHITEKNEE_ID).outfit, {});
  assert.deepEqual(owned, ownershipBefore);
});

test('saved companion profiles normalize malformed poses and discard unowned or mismatched clothing', () => {
  const student = {spaceOwned: [WHITEKNEE_ID, 'whiteknee-body-hero']};
  const room = {...defaultRoom(), pet: WHITEKNEE_ID, pose: 'flying', outfit: {body: 'whiteknee-body-hero', bag: 'whiteknee-body-chef'}};
  assert.deepEqual(companionProfile(student, room)?.outfit, {body: 'whiteknee-body-hero'});
  assert.equal(companionProfile(student, room)?.pose, 'rest');
  assert.deepEqual(companionProfile({spaceOwned: [WHITEKNEE_ID]}, room)?.outfit, {});
  assert.deepEqual(companionProfile({spaceOwned: [WHITEKNEE_ID, 'body-knit']}, {...room, outfit: {body: 'body-knit'}})?.outfit, {});
  assert.equal(companionProfile({}, {...defaultRoom(), pose: 'raised'})?.pose, 'rest');
  assert.deepEqual(roomCompanionAppearance(undefined, owned, WHITEKNEE_ID).outfit, {});
  assert.throws(() => roomCompanionAppearance(room, starterSpaceIds, WHITEKNEE_ID));
});
