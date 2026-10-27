import test from 'node:test';
import assert from 'node:assert/strict';
import motion from '../continuous/motion.js';

const curved = {
  width: 1000, height: 800, cellSize: 20, spawn: {x: 100, y: 650},
  roads: [{width: 80, points: [{x: 100, y: 650}, {x: 450, y: 650}, {x: 650, y: 400}, {x: 650, y: 100}]}],
  obstacles: [],
};

function walkRoute(from, route, world, step=8.8) {
  let position = {...from};
  for (const target of route) {
    let frames = 0;
    while (Math.hypot(target.x - position.x, target.y - position.y) > 0.001) {
      assert.ok(++frames < 1000, 'the actor must not stick to a planned road edge');
      const dx = target.x - position.x, dy = target.y - position.y;
      const factor = Math.min(1, step / Math.hypot(dx, dy));
      position = motion.move(position, {x: dx * factor, y: dy * factor}, world);
      assert.ok(motion.isWalkable(position, world));
    }
  }
  return position;
}

test('continuous walking follows the road capsule union, including bends and intersections', () => {
  assert.ok(motion.isWalkable({x: 100, y: 650}, curved));
  assert.ok(motion.isWalkable({x: 550, y: 525}, curved));
  assert.ok(motion.isWalkable({x: 650, y: 350}, curved));
  assert.equal(motion.isWalkable({x: 450, y: 400}, curved), false);
  assert.equal(motion.isWalkable({x: -1, y: 650}, curved), false);
  assert.equal(motion.isWalkable({x: NaN, y: 650}, curved), false);
  const branch = {...curved, roads: [...curved.roads, {width: 60, points: [{x: 650, y: 250}, {x: 850, y: 250}]}]};
  assert.ok(motion.isWalkable({x: 650, y: 250}, branch));
  assert.ok(motion.findPath(curved.spawn, {x: 850, y: 250}, branch).length);
});

test('movement cannot cut directly through the empty land inside a road bend', () => {
  const start = {x: 450, y: 650};
  const moved = motion.move(start, {x: 200, y: -550}, curved);
  assert.ok(motion.isWalkable(moved, curved));
  assert.ok(Math.hypot(moved.x - 650, moved.y - 100) > 50);
  assert.deepEqual(start, {x: 450, y: 650});
});

test('a thin wall blocks large motion while diagonal input slides on its free axis', () => {
  const world = {width: 500, height: 400, roads: [{width: 250, points: [{x: 30, y: 200}, {x: 470, y: 200}]}], obstacles: [{x: 250.3, y: 75, width: 0.4, height: 250}]};
  const moved = motion.move({x: 200, y: 200}, {x: 200, y: 0}, world);
  assert.ok(moved.x < 250.3);
  const slide = motion.move({x: 245, y: 200}, {x: 50, y: 50}, world);
  assert.ok(slide.x < 250.3);
  assert.ok(slide.y > 240);
  assert.deepEqual(motion.findPath({x: 100, y: 200}, {x: 400, y: 200}, world), []);
});

test('a sub-pixel gap between separate road ends cannot be skipped', () => {
  const world = {
    width: 400, height: 200,
    roads: [{width: 40, points: [{x: 0, y: 100}, {x: 80, y: 100}]}, {width: 40, points: [{x: 120.4, y: 100}, {x: 300, y: 100}]}],
    obstacles: [],
  };
  const moved = motion.move({x: 90, y: 100}, {x: 40, y: 0}, world);
  assert.ok(moved.x <= 100);
  assert.deepEqual(motion.findPath({x: 50, y: 100}, {x: 250, y: 100}, world), []);
});

test('click paths keep the actual road bend and can be followed by frame movement', () => {
  const destination = {x: 650, y: 100};
  const route = motion.findPath(curved.spawn, destination, curved);
  assert.ok(route.length >= 3, 'a direct diagonal shortcut would leave the road');
  assert.deepEqual(route.at(-1), destination);
  const arrived = walkRoute(curved.spawn, route, curved);
  assert.ok(Math.hypot(arrived.x - destination.x, arrived.y - destination.y) < 0.001);
});

test('NPC obstacles are avoided on a wide road while blocked and disconnected goals fail', () => {
  const world = {width: 800, height: 600, roads: [{width: 160, points: [{x: 100, y: 300}, {x: 700, y: 300}]}], obstacles: [{x: 350, y: 280, width: 80, height: 40}]};
  const from = {x: 100, y: 300}, to = {x: 700, y: 300};
  const route = motion.findPath(from, to, world);
  assert.ok(route.some(p => p.y < 280 || p.y > 320));
  assert.deepEqual(walkRoute(from, route, world), to);
  assert.deepEqual(motion.findPath(from, {x: 390, y: 300}, world), []);
  const separate = {...world, obstacles: [], roads: [...world.roads, {width: 40, points: [{x: 100, y: 50}, {x: 700, y: 50}]}]};
  assert.deepEqual(motion.findPath(from, {x: 700, y: 50}, separate), []);
});

test('click snapping finds a nearby free road point and respects its maximum radius', () => {
  const world = {width: 800, height: 600, roads: [{width: 100, points: [{x: 100, y: 300}, {x: 700, y: 300}]}], obstacles: [{x: 350, y: 280, width: 80, height: 40}]};
  const point = motion.nearestWalkable({x: 200, y: 200}, world, 60);
  assert.ok(point && motion.isWalkable(point, world));
  assert.ok(Math.hypot(point.x - 200, point.y - 200) <= 60);
  const nearNPC = motion.nearestWalkable({x: 390, y: 300}, world, 40);
  assert.ok(nearNPC && motion.isWalkable(nearNPC, world));
  assert.equal(motion.nearestWalkable({x: 200, y: 100}, world, 20), null);
  assert.equal(motion.nearestWalkable({x: NaN, y: 300}, world), null);
  assert.equal(motion.nearestWalkable({x: 200, y: 200}, world, -1), null);
});

test('camera follows the character, stops at large-world edges and centers a smaller world', () => {
  const world = {width: 4000, height: 3000}, viewport = {width: 1000, height: 600};
  assert.deepEqual(motion.cameraFor({x: 2000, y: 1500}, viewport, world), {x: 1500, y: 1200, width: 1000, height: 600});
  assert.deepEqual(motion.cameraFor({x: 10, y: 10}, viewport, world), {x: 0, y: 0, width: 1000, height: 600});
  assert.deepEqual(motion.cameraFor({x: 3990, y: 2990}, viewport, world), {x: 3000, y: 2400, width: 1000, height: 600});
  assert.deepEqual(motion.cameraFor({x: 100, y: 100}, viewport, {width: 400, height: 200}), {x: -300, y: -200, width: 1000, height: 600});
});

test('a 4000 pixel world finds a long road route without exceeding the grid budget', () => {
  const world = {width: 4000, height: 4000, roads: [{width: 80, points: [{x: 100, y: 3900}, {x: 3900, y: 3900}, {x: 3900, y: 100}]}], obstacles: []};
  const route = motion.findPath({x: 100, y: 3900}, {x: 3900, y: 100}, world);
  assert.ok(route.length >= 2);
  assert.deepEqual(route.at(-1), {x: 3900, y: 100});
});

const box=(x,y,w,h)=>[{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}];

test('free roaming keeps road geometry while lawns become directly walkable', () => {
  const world={...curved,freeRoam:true,water:[],solids:[],actorRadius:8};
  const destination={x:650,y:100};
  assert.ok(motion.isWalkable({x:450,y:400},world));
  assert.deepEqual(motion.findPath(curved.spawn,destination,world),[destination]);
  const moved=motion.move({x:450,y:650},{x:0,y:-200},world);
  assert.ok(Math.abs(moved.y-450)<.001);
  assert.equal(world.roads,curved.roads,'free exploration must not rewrite geographic roads');
  assert.equal(motion.isWalkable({x:3,y:400},world),false,'the actor footprint stays inside the map');
});

test('thin water and building polygons stop high-speed travel without tunneling', () => {
  for(const property of ['water','solids']) {
    const world={width:800,height:500,freeRoam:true,roads:[],obstacles:[],[property]:[box(300.1,0,.2,500)],actorRadius:8};
    const stopped=motion.move({x:100,y:250},{x:600,y:0},world);
    assert.ok(stopped.x<292.1,`${property} blocks the full actor radius`);
    assert.deepEqual(motion.findPath({x:100,y:250},{x:700,y:250},world),[]);
    const slide=motion.move({x:290,y:150},{x:100,y:150},world);
    assert.ok(slide.x<292.1&&slide.y>290,'diagonal travel slides along the shoreline or wall');
  }
});

test('terrain click paths route around water, buildings and NPCs at car speed', () => {
  const world={width:1000,height:700,cellSize:20,freeRoam:true,actorRadius:8,roads:[],water:[box(220,80,160,330)],solids:[box(520,280,160,330)],obstacles:[{x:450,y:480,radius:28}]};
  const start={x:70,y:350},goal={x:930,y:350};
  const path=motion.findPath(start,goal,world);
  assert.ok(path.length>2);
  assert.deepEqual(path.at(-1),goal);
  const arrived=walkRoute(start,path,world,26),returned=walkRoute(goal,motion.findPath(goal,start,world),world,26);
  assert.ok(Math.hypot(arrived.x-goal.x,arrived.y-goal.y)<.001);
  assert.ok(Math.hypot(returned.x-start.x,returned.y-start.y)<.001);
  assert.equal(motion.isWalkable({x:480,y:480},world),false,'NPC body includes actor clearance');
  const stopped=motion.move({x:400,y:480},{x:100,y:0},world);
  assert.ok(stopped.x<414,'a fast car cannot pass through an NPC');
});

test('polygon collisions use the actual footprint, not only its bounding rectangle', () => {
  const world={width:500,height:500,freeRoam:true,roads:[],solids:[[{x:100,y:100},{x:400,y:100},{x:100,y:400}]],actorRadius:8};
  assert.equal(motion.isWalkable({x:150,y:150},world),false);
  assert.ok(motion.isWalkable({x:360,y:360},world));
  assert.equal(motion.isWalkable({x:250,y:255},world),false,'clearance includes diagonal building edges');
  const snapped=motion.nearestWalkable({x:200,y:200},world,90);
  assert.ok(snapped&&motion.isWalkable(snapped,world));
  assert.ok(Math.hypot(snapped.x-200,snapped.y-200)<=90);
  assert.equal(motion.nearestWalkable({x:200,y:200},world,10),null);
});

test('road guide rejoins the road after free roaming and preserves bends', () => {
  const world={...curved,freeRoam:true,water:[],solids:[],actorRadius:8};
  const start={x:250,y:530},goal={x:650,y:100};
  const path=motion.findRoadPath(start,goal,world);
  assert.ok(path.length>=3,'the guide must retain bends instead of cutting across grass');
  assert.deepEqual(path.at(-1),goal);
  assert.deepEqual(walkRoute(start,path,world,26),goal);
  const roadWorld={...world,freeRoam:false};
  assert.ok(path.slice(1).every(p=>motion.isWalkable(p,roadWorld)));
  assert.deepEqual(motion.findRoadPath(curved.spawn,goal,curved),motion.findPath(curved.spawn,goal,curved));
});

test('road guide can bypass the closest disconnected road when joining from grass', () => {
  const world={width:800,height:600,freeRoam:true,cellSize:20,actorRadius:8,obstacles:[],roads:[{width:40,points:[{x:100,y:100},{x:300,y:100}]},{width:60,points:[{x:100,y:300},{x:600,y:300},{x:600,y:500}]}]};
  const from={x:180,y:150},to={x:600,y:500};
  const route=motion.findRoadPath(from,to,world);
  assert.ok(route.length>=2,'join the connected road further south');
  assert.deepEqual(route.at(-1),to);
  const arrived=walkRoute(from,route,world,26);
  assert.ok(Math.hypot(arrived.x-to.x,arrived.y-to.y)<.001);
});
