import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { defaultRoom, starterSpaceIds, spaceCatalog, illustratedRoomThemes } from './catalog';
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

test('ten illustrated room themes have unique full-size art and lightweight thumbnails with verified hashes', () => {
    assert.equal(illustratedRoomThemes.length, 10);
    assert.equal(new Set(illustratedRoomThemes.map(t => t.art)).size, 10);
    const manifest = JSON.parse(readFileSync('public/my-space/v6/rooms/manifest.json', 'utf8'));
    assert.equal(manifest.assets.length, 20);
    for (const theme of illustratedRoomThemes) {
        assert.equal(theme.kind, 'theme'); assert.equal(theme.price, 80);
        for (const [src, width, height] of [[theme.art, 1440, 1080], [theme.previewArt, 480, 360]] as const) {
            const asset = manifest.assets.find((a: {src: string}) => a.src === src);
            assert(asset, src); assert.equal(asset.width, width); assert.equal(asset.height, height);
            const bytes = readFileSync('public' + src);
            assert.equal(bytes.length, asset.bytes);
            assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256);
        }
    }
    assert(spaceCatalog.some(t => t.id === 'theme-sage' && t.price === 0));
    assert(spaceCatalog.some(t => t.id === 'theme-peach' && t.price === 70));
    assert(spaceCatalog.some(t => t.id === 'theme-night' && t.price === 80));
});

test('new backgrounds require ownership and preserve the same furniture, friend and clothing', () => {
    const previous = {...defaultRoom(), pet: 'friend-dog', nicknames: {'friend-dog': '방 친구'}, outfit: {body: 'body-knit'}};
    for (const theme of illustratedRoomThemes) {
        assert.throws(() => validateRoom({...previous, theme: theme.id}, [...starterSpaceIds, 'body-knit']));
        const saved = validateRoom({...previous, theme: theme.id}, [...starterSpaceIds, 'body-knit', theme.id]);
        assert.equal(saved.theme, theme.id);
        assert.deepEqual(saved.placements, previous.placements);
        assert.deepEqual(saved.outfit, previous.outfit);
        assert.deepEqual(saved.nicknames, previous.nicknames);
        assert.equal(saved.pet, previous.pet);
    }
});
