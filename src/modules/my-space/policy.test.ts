import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { defaultRoom, starterSpaceIds, spaceCatalog } from './catalog';
import { growth, ownedItems, validateRoom, validateDiary } from './policy';
test('earned growth persists independently of spending and adoption has its own starting point', () => { assert.equal(growth(59).stage, 0); assert.equal(growth(60).stage, 1); assert.equal(growth(200).stage, 2); assert.equal(growth(210, 200).stage, 0); assert.equal(growth(350, 200).total, 150); assert.equal(growth(400, 200).next, null); });
test('only catalog items can become owned, and the existing six friends stay free', () => { const owned = ownedItems(['cat-british', 'not-an-item', '__proto__', 'cat-british']); assert.equal(owned.filter(k => k === 'cat-british').length, 1); assert(!owned.includes('__proto__')); assert.equal(owned.filter(k => k.startsWith('friend-')).length, 6); });
test('room edits reject unowned items, NaN positions, duplicate instance IDs and wrong clothing slots', () => { const room = defaultRoom(); assert.equal(validateRoom(room, starterSpaceIds).placements.length, 1); assert.throws(() => validateRoom({ ...room, pet: 'cat-british' }, starterSpaceIds)); assert.throws(() => validateRoom({ ...room, placements: [{ ...room.placements[0], x: NaN }] }, starterSpaceIds)); assert.throws(() => validateRoom({ ...room, placements: [room.placements[0], room.placements[0]] }, starterSpaceIds)); assert.throws(() => validateRoom({ ...room, outfit: { body: 'bag-leaf' } }, [...starterSpaceIds, 'bag-leaf'])); });
test('private diary stores typed references, bounded text and reusable owned stickers', () => { const page = { version: 0, title: '내 이야기', date: '2026-10-18', paper: 'paper-cream', layers: [{ id: 'star1', itemId: 'sticker-star', kind: 'sticker', x: 30, y: 40, size: 20, rotation: 0, flip: false }] }; assert.equal(validateDiary(page, starterSpaceIds).layers.length, 1); assert.throws(() => validateDiary({ ...page, date: '2026-02-30' }, starterSpaceIds)); assert.throws(() => validateDiary({ ...page, layers: [{ ...page.layers[0], itemId: 'sticker-flower' }] }, starterSpaceIds)); assert.throws(() => validateDiary({ ...page, layers: [{ ...page.layers[0], kind: 'photo', assetId: 'https://outside.example/image' }] }, starterSpaceIds)); assert.throws(() => validateDiary({ ...page, layers: [{ ...page.layers[0], kind: 'text', text: 'a'.repeat(301) }] }, starterSpaceIds)); });
test('catalog keeps stable unique item IDs and every referenced illustration is bundled', () => { assert.equal(new Set(spaceCatalog.map(i => i.id)).size, spaceCatalog.length); for (const item of spaceCatalog) {
    assert(Number.isSafeInteger(item.price) && item.price >= 0);
    if (item.art)
        assert(existsSync(path.join(process.cwd(), 'public', item.art)), item.art);
} });
