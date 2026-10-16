import assert from 'node:assert/strict';
import test from 'node:test';
import {artScreenSize, exhibitionFrameSize, exhibitionRoomDimensions, exhibitionWallSlots, GALLERY_SCREEN, WORLD_WING_CAPACITY} from './exhibition-world-layout';

// Clearance covers the displayed 2.65 × 1.87 frame, its name plaque,
// and the 0.04 bevel, rather than just testing the frame's center point.
const halfWidth = 2.4 / 2 + 0.04;
const top = 2.4 / 2 + 0.04;
const bottom = 2.4 / 2 + .23 + .27 / 2 + .04;

test('portrait, landscape and square works keep their exact ratio and equal long side inside a narrow frame', () => {
  for (const [width,height] of [[300,900],[900,300],[500,500],[240,1000]]) {
    const size=exhibitionFrameSize(width,height);
    assert(Math.abs(size.imageWidth/size.imageHeight-width/height)<1e-9);
    assert.equal(Math.max(size.imageWidth,size.imageHeight),2.05);
    assert(Math.abs(size.width-size.imageWidth-.35)<1e-9);
    assert(Math.abs(size.height-size.imageHeight-.35)<1e-9);
    assert(size.border < .05);
  }
  assert.deepEqual(exhibitionFrameSize(NaN,0),exhibitionFrameSize(3,2));
});

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

test('25 wall artworks surround the central screen without hiding any frame or caption', () => {
  const slots=exhibitionWallSlots(25);
  assert.deepEqual(['back','left','right'].map(wall=>slots.filter(slot=>slot.wall===wall).length),[8,9,8]);
  for(let count=0;count<=WORLD_WING_CAPACITY;count++)for(const slot of exhibitionWallSlots(count))if(slot.wall==='back')assert(Math.abs(slot.x)-halfWidth>GALLERY_SCREEN.outerWidth/2+.25);
  assert(GALLERY_SCREEN.width*GALLERY_SCREEN.height/(2.65*1.87)>3.8);
  assert(GALLERY_SCREEN.y+GALLERY_SCREEN.imageOffsetY+GALLERY_SCREEN.outerHeight/2<7.2);
  assert(GALLERY_SCREEN.y+GALLERY_SCREEN.imageOffsetY-GALLERY_SCREEN.outerHeight/2>0);
});

test('the central screen follows portrait and landscape ratios within the wall and keeps a narrow white mat',()=>{for(const [width,height]of [[480,720],[720,480],[720,720],[100,1000],[1000,100]]){const value=artScreenSize(width,height);assert(Math.abs(value.imageWidth/value.imageHeight-width/height)<1e-9);assert(value.imageWidth<=6.40001&&value.imageHeight<=4.20001);assert(value.width<=GALLERY_SCREEN.outerWidth&&value.height<=GALLERY_SCREEN.outerHeight);assert(Math.abs(value.width-value.imageWidth-.35)<1e-9);assert(Math.abs(value.surfaceHeight-value.imageHeight-.42)<1e-9);}assert.deepEqual(artScreenSize(NaN,0),artScreenSize());assert.equal(artScreenSize(1,1,true).imageWidth,6.4);});
