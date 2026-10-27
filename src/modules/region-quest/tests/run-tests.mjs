// Local pure-function tests; no Firebase, AI, map API, or network calls.
await import('./prototype.test.mjs');
await import('./continuous-motion.test.mjs');
await import('./continuous-data.test.mjs');
await import('./continuous-server.test.mjs');
await import('./continuous-world.test.mjs');
await import('./continuous-game.test.mjs');

await import('./beta-storage.test.ts');

await import('./beta-bridge.test.mjs');
