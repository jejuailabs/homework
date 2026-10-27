import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import motion from '../continuous/motion.js';
import {buildContinuousDocuments} from '../scripts/serve-continuous.mjs';

const data = JSON.parse(await readFile(new URL('../continuous/data/aewol.json', import.meta.url), 'utf8'));
const source = await readFile(new URL('../continuous/world.js', import.meta.url), 'utf8');
const context = {RQ_DATA: data};
vm.runInNewContext(source, context);
const village = context.ContinuousWorld;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

test('actual Aewol world preserves every road coordinate with one uniform projection', () => {
  assert.equal(village.roads.length, data.roads.length);
  assert.ok(village.world.width > 3000 && village.world.height > 2500);
  for (let r = 0; r < data.roads.length; r++) {
    assert.equal(village.roads[r].points.length, data.roads[r].points.length);
    for (let i = 0; i < data.roads[r].points.length; i++) {
      const original = data.roads[r].points[i], actual = village.roads[r].points[i];
      assert.equal(actual.x, (original.x - data.extent.minX) * village.scale + village.padding);
      assert.equal(actual.y, (original.y - data.extent.minY) * village.scale + village.padding);
    }
  }
  assert.ok(motion.isWalkable(village.world.spawn, village.world));
  for (const stop of village.stops) assert.ok(motion.isWalkable(stop.point, village.world), stop.id);
});

test('actual school, road bend, coast and return journeys finish using frame-by-frame collision movement', () => {
  const {world, stops} = village;
  const school = stops.find(s => s.id === 'school');
  const bend = stops.find(s => s.id === 'bend');
  const coast = stops.find(s => s.id === 'coast');
  let position = {...world.spawn};
  for (const target of [school, bend, coast, school, {id: 'spawn', point: world.spawn}]) {
    const path = motion.findPath(position, target.point, world);
    assert.ok(path.length > 0, `${target.id} must have a reachable walking route`);
    let totalFrames = 0;
    for (const waypoint of path) {
      let frames = 0;
      while (distance(position, waypoint) > 0.001) {
        assert.ok(++frames < 2000, `stuck on ${target.id}'s route`);
        totalFrames++;
        const dx = waypoint.x - position.x, dy = waypoint.y - position.y;
        // Same upper frame duration and movement speed used by game.js.
        const factor = Math.min(1, 190 * 0.04 / Math.hypot(dx, dy));
        position = motion.move(position, {x: dx * factor, y: dy * factor}, world);
        assert.ok(motion.isWalkable(position, world), `left the road toward ${target.id}`);
      }
    }
    assert.ok(totalFrames > 0);
    assert.ok(distance(position, target.point) < 0.001, target.id);
    const camera = motion.cameraFor(position, {width: 1200 / 0.9, height: 720 / 0.9}, world);
    assert.ok(camera.x >= 0 && camera.y >= 0);
    assert.ok(camera.x + camera.width <= world.width + 0.001);
    assert.ok(camera.y + camera.height <= world.height + 0.001);
  }
});

test('continuous page assembles with real data, all image bytes and syntactically valid inline scripts', async () => {
  const built = await buildContinuousDocuments();
  for (const placeholder of ['__STYLE__', '__MOTION__', '__WORLD__', '__GAME__', '__DATA__', '__ASSETS__']) {
    assert.equal(built.html.includes(placeholder), false, placeholder);
  }
  assert.ok(built.assets.has('/assets/player.png'));
  assert.ok(built.assets.has('/assets/guide.png'));
  assert.ok(built.assets.has('/assets/school.webp'));
  for (const [path, asset] of built.assets) {
    assert.ok(path.startsWith('/assets/'));
    assert.ok(asset.body.length > 0);
    assert.match(asset.contentType, /^image\//);
  }
  const scripts = [...built.html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length, 4);
  for (const [index, script] of scripts.entries()) assert.doesNotThrow(() => new vm.Script(script[1]), `inline script ${index}`);
});
