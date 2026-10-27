'use strict';

// World-space feet, not the tall sprite silhouettes, define physical contact.
globalThis.RegionQuestWorld = (() => {
  const locations = {
    home: {x: 450, y: 500}, guide: {x: 850, y: 550},
    letter: {x: 610, y: 775}, mailbox: {x: 1415, y: 650},
  };
  const playerFootprint = {width: 48, depth: 24};
  const actors = [{id: 'guide', position: locations.guide, footprint: {width: 66, depth: 32}}];
  const world = {
    width: 1600, height: 1000, cellSize: 25,
    walkRegions: [[[200,480],[1100,440],[1120,570],[1460,625],[1490,760],[1260,875],[405,875],[130,700]]],
    // Expand each NPC footprint by the player's half-size. Both pathfinding
    // and keyboard movement then check the same forbidden player-center area.
    obstacles: actors.map(({position, footprint}) => {
      const width = footprint.width + playerFootprint.width;
      const height = footprint.depth + playerFootprint.depth;
      return {x: position.x - width / 2, y: position.y - height / 2, width, height};
    }),
  };
  return {locations, playerFootprint, actors, world};
})();
if (typeof module !== 'undefined' && module.exports) module.exports = globalThis.RegionQuestWorld;
