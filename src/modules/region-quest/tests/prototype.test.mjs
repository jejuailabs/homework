import test from 'node:test';
import assert from 'node:assert/strict';
import model from '../prototype/model.js';
import village from '../prototype/world.js';

const world = {
  width: 250, height: 200, cellSize: 25,
  walkRegions: [[[0, 0], [250, 0], [250, 200], [0, 200]]],
  obstacles: [{x: 100, y: 0, width: 50, height: 125}],
};

test('four-direction path goes around walls and ends at the exact requested point', () => {
  const from = {x: 50, y: 50}, to = {x: 200, y: 50};
  const path = model.findPath(from, to, world);
  assert.ok(path.length > 0);
  assert.deepEqual(path.at(-1), to);
  assert.ok(path.some(p => p.y > 125));
  let previous = from;
  for (const target of path) {
    const dx = target.x - previous.x, dy = target.y - previous.y;
    for (let step = 0; step <= 20; step++) assert.ok(model.isWalkable({x: previous.x + dx * step / 20, y: previous.y + dy * step / 20}, world));
    previous = target;
  }
});

test('blocked, out-of-bounds and disconnected destinations do not produce paths', () => {
  assert.deepEqual(model.findPath({x: 50, y: 50}, {x: 125, y: 50}, world), []);
  assert.deepEqual(model.findPath({x: 50, y: 50}, {x: -5, y: 50}, world), []);
  const divided = {...world, obstacles: [{x: 100, y: 0, width: 50, height: 200}]};
  assert.deepEqual(model.findPath({x: 50, y: 50}, {x: 200, y: 50}, divided), []);
});

test('long and diagonal movement cannot tunnel through walls and can slide along them', () => {
  const from = {x: 50, y: 50};
  const straight = model.move(from, {x: 150, y: 0}, world);
  assert.ok(straight.x < 100);
  assert.equal(straight.y, 50);
  const diagonal = model.move({x: 90, y: 50}, {x: 50, y: 50}, world);
  assert.ok(diagonal.x < 100);
  assert.equal(diagonal.y, 100);
  assert.ok(model.isWalkable(diagonal, world));
  assert.deepEqual(from, {x: 50, y: 50});
});

test('movement directions stay stable while stationary and handle invalid input', () => {
  assert.equal(model.directionForDelta(-2, 0), 'left');
  assert.equal(model.directionForDelta(2, 0), 'right');
  assert.equal(model.directionForDelta(0, -2), 'up');
  assert.equal(model.directionForDelta(0, 2), 'down');
  assert.equal(model.directionForDelta(0, 0, 'left'), 'left');
  assert.equal(model.directionForDelta(NaN, 2, 'unknown'), 'down');
});

test('movement and pathfinding cannot skip obstacles thinner than a movement substep', () => {
  const thin = {...world, obstacles: [{x: 100.3, y: 0, width: 0.4, height: 200}]};
  const moved = model.move({x: 90, y: 50}, {x: 30, y: 0}, thin);
  assert.ok(moved.x < 100.3);
  assert.deepEqual(model.findPath({x: 50, y: 50}, {x: 200, y: 50}, thin), []);
});

test('local save normalization drops unknown fields and repairs malformed positions', () => {
  const normalized = model.normalizeState({version: 1, phase: 'deliver', position: {x: Infinity, y: 5}, facing: 'sideways', atHome: true, resume: {x: -5, y: 100}, secret: 'discard'});
  assert.equal(normalized.phase, 'deliver');
  assert.deepEqual(normalized.position, model.createState().position);
  assert.equal(normalized.facing, 'down');
  assert.equal(normalized.atHome, false);
  assert.equal(normalized.resume, null);
  assert.equal('secret' in normalized, false);
  for (const input of [null, '', [], {version: 99}, {version: 1, position: {x: '400', y: 700}}]) assert.ok(model.isWalkable(model.normalizeState(input).position));
});

test('mail quest only advances in order, once, and never while at home', () => {
  const initial = model.createState();
  assert.equal(model.advanceQuest(initial, 'deliver').phase, 'meet');
  const accepted = model.advanceQuest(initial, 'accept');
  assert.equal(accepted.phase, 'find');
  assert.equal(initial.phase, 'meet');
  assert.equal(model.advanceQuest(accepted, 'accept').phase, 'find');
  const collected = model.advanceQuest(accepted, 'collect');
  assert.equal(collected.phase, 'deliver');
  assert.equal(model.advanceQuest(model.returnHome(collected), 'deliver').phase, 'deliver');
  const delivered = model.advanceQuest(collected, 'deliver');
  assert.equal(delivered.phase, 'done');
  assert.equal(model.advanceQuest(delivered, 'deliver').phase, 'done');
});

test('return, repeated return and save/load preserve the original checkpoint and quest', () => {
  const exploring = {...model.createState(), phase: 'deliver', position: {x: 950, y: 760}, facing: 'left'};
  const returned = model.returnHome(exploring);
  assert.deepEqual(returned.resume, {x: 950, y: 760, facing: 'left'});
  assert.equal(returned.phase, 'deliver');
  assert.deepEqual(returned.position, {x: 400, y: 700});
  const repeated = model.returnHome(returned);
  assert.deepEqual(repeated.resume, returned.resume);
  const saved = model.normalizeState(JSON.parse(JSON.stringify(repeated)));
  assert.deepEqual(model.resumeAdventure(saved), exploring);
  assert.equal(exploring.atHome, false);
  assert.equal(exploring.resume, null);
});

test('active map geometry is used by save/load, quest transitions, return and resume', () => {
  const activeWorld = {
    ...model.DEFAULT_WORLD,
    walkRegions: [[[200,480],[1100,440],[1120,570],[1460,625],[1490,760],[1260,875],[405,875],[130,700]]],
  };
  const position = {x: 1000, y: 460}, home = {x: 450, y: 500};
  assert.equal(model.isWalkable(position), false, 'the active map extends above the original rectangle');
  assert.equal(model.isWalkable(position, activeWorld), true);
  const exploring = {...model.createState(), position, facing: 'up'};
  const restored = model.normalizeState(JSON.parse(JSON.stringify(exploring)), activeWorld);
  assert.deepEqual(restored.position, position);
  const accepted = model.advanceQuest(restored, 'accept', activeWorld);
  assert.equal(accepted.phase, 'find');
  assert.deepEqual(accepted.position, position);
  const returned = model.returnHome(accepted, home, activeWorld);
  assert.deepEqual(returned.resume, {...position, facing: 'up'});
  assert.deepEqual(returned.position, home);
  const repeated = model.returnHome(returned, home, activeWorld);
  const savedAtHome = model.normalizeState(JSON.parse(JSON.stringify(repeated)), activeWorld);
  assert.deepEqual(model.resumeAdventure(savedAtHome, activeWorld), accepted);
  const outsideActiveMap = {x: 105, y: 480};
  assert.equal(model.isWalkable(outsideActiveMap), true);
  assert.equal(model.isWalkable(outsideActiveMap, activeWorld), false);
  assert.deepEqual(model.normalizeState({...exploring, position: outsideActiveMap}, activeWorld).position, model.createState().position);
  assert.equal(model.returnHome(accepted, outsideActiveMap, activeWorld).atHome, false);
});

test('NPC contact keeps both foot areas apart from every direction and permits sliding', () => {
  const {world: map, locations: {guide}, playerFootprint, actors} = village;
  const halfWidth = (playerFootprint.width + actors[0].footprint.width) / 2;
  const halfDepth = (playerFootprint.depth + actors[0].footprint.depth) / 2;
  const cases = [
    [{x: 700, y: guide.y}, {x: 400, y: 0}, p => p.x < guide.x - halfWidth],
    [{x: 1000, y: guide.y}, {x: -400, y: 0}, p => p.x > guide.x + halfWidth],
    [{x: guide.x, y: 490}, {x: 0, y: 250}, p => p.y < guide.y - halfDepth],
    [{x: guide.x, y: 700}, {x: 0, y: -250}, p => p.y > guide.y + halfDepth],
  ];
  for (const [from, delta, remainsOnApproachSide] of cases) {
    const stopped = model.move(from, delta, map);
    assert.ok(remainsOnApproachSide(stopped));
    assert.ok(model.isWalkable(stopped, map));
  }
  const slide = model.move({x: 780, y: 540}, {x: 40, y: 20}, map);
  assert.ok(slide.x < guide.x - halfWidth);
  assert.ok(slide.y > 540, 'a diagonal press still moves along the free axis');
});

test('click paths actually walk around the NPC and preserve access to conversation and quests', () => {
  const {world: map, locations: {guide, letter, mailbox}} = village;
  const approach = {x: guide.x, y: guide.y + 70};
  const journeys = [
    [{x: 700, y: 550}, {x: 1000, y: 550}],
    [{x: 1000, y: 550}, {x: 700, y: 550}],
    [{x: 850, y: 490}, approach],
    [model.createState().position, approach],
    [approach, letter],
    [letter, {x: mailbox.x - 40, y: mailbox.y + 45}],
  ];
  for (const [from, to] of journeys) {
    const path = model.findPath(from, to, map);
    assert.ok(path.length, `reachable destination ${JSON.stringify(to)}`);
    let position = {...from};
    for (const target of path) {
      let steps = 0;
      while (Math.hypot(target.x - position.x, target.y - position.y) > 0.001) {
        assert.ok(++steps < 100, 'path follower must not get stuck on the NPC');
        const dx = target.x - position.x, dy = target.y - position.y;
        const factor = Math.min(1, 8.8 / Math.hypot(dx, dy));
        position = model.move(position, {x: dx * factor, y: dy * factor}, map);
        assert.ok(model.isWalkable(position, map));
      }
    }
    assert.ok(Math.hypot(position.x - to.x, position.y - to.y) < 0.001);
  }
  assert.ok(Math.hypot(approach.x - guide.x, approach.y - guide.y) < 125);
  assert.deepEqual(model.findPath(model.createState().position, guide, map), []);
});

test('a pre-collision save inside an NPC recovers without losing mission progress', () => {
  const oldSave = {...model.createState(), phase: 'deliver', position: village.locations.guide};
  const restored = model.normalizeState(oldSave, village.world);
  assert.ok(model.isWalkable(restored.position, village.world));
  assert.equal(restored.phase, 'deliver');
  const moved = model.move(restored.position, {x: 10, y: 0}, village.world);
  assert.notDeepEqual(moved, restored.position, 'the restored player is not trapped');
});
