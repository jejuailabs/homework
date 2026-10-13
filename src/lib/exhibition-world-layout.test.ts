import assert from 'node:assert/strict';
import test from 'node:test';
import {exhibitionRoomDimensions, exhibitionWallSlots, WORLD_WING_CAPACITY} from './exhibition-world-layout';

// Clearance covers the displayed 2.65 × 1.87 frame, its name plaque,
// and the 0.04 bevel, rather than just testing the frame's center point.
const halfWidth = 2.65 / 2 + 0.04;
const top = 1.87 / 2 + 0.04;
const bottom = 1.1 + 0.27 / 2 + 0.04;

test('all 25 classmates receive distinct frame positions in one gallery room', () => {
  const slots = exhibitionWallSlots(25);
  assert(WORLD_WING_CAPACITY >= 25, 'a class of 25 must not be split across wings');
  assert.equal(slots.length, 25, 'no classmate artwork may be silently omitted');
  assert.equal(new Set(slots.map(slot => `${slot.x},${slot.y},${slot.z}`)).size, 25);
});

test('every supported gallery size keeps complete frames and name plaques inside the walls', () => {
  for (let count = 0; count <= WORLD_WING_CAPACITY; count++) {
    const slots = exhibitionWallSlots(count);
    const room = exhibitionRoomDimensions(count);
    assert.equal(slots.length, count, `${count}: missing artwork position`);
    for (const [index, slot] of slots.entries()) {
      const label = `${count} artworks, frame ${index + 1}`;
      assert(slot.y - bottom >= 0 && slot.y + top < 6.3, `${label}: frame or plaque crosses the floor/ceiling`);
      const alongWall = slot.wall === 'back' ? slot.x : slot.z;
      const halfWall = slot.wall === 'back' ? room.width / 2 : room.depth / 2;
      assert(Math.abs(alongWall) + halfWidth < halfWall, `${label}: frame crosses the wall edge`);
      assert(Math.abs(slot.x) < room.width / 2 && Math.abs(slot.z) < room.depth / 2, `${label}: frame lies outside the room`);
    }
  }
});

test('frames and their name plaques never obscure another artwork on the same wall', () => {
  for (let count = 1; count <= WORLD_WING_CAPACITY; count++) {
    const slots = exhibitionWallSlots(count);
    for (const [index, slot] of slots.entries()) {
      for (const other of slots.slice(index + 1)) {
        if (other.wall !== slot.wall) continue;
        const horizontalDistance = Math.abs(slot.wall === 'back' ? slot.x - other.x : slot.z - other.z);
        const separated = horizontalDistance >= 2 * halfWidth - 0.00001 || Math.abs(slot.y - other.y) >= top + bottom - 0.00001;
        assert(separated, `${count} artworks: overlapping frame or plaque on ${slot.wall} wall`);
      }
    }
  }
});

test('a wing supports 32 artworks and bounds larger requests for the next wing', () => {
  assert.equal(WORLD_WING_CAPACITY, 32);
  assert.equal(exhibitionWallSlots(32).length, 32);
  assert.equal(exhibitionWallSlots(33).length, 32);
  assert.equal(exhibitionWallSlots(-1).length, 0);
});
