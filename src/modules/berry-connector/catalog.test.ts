import assert from 'node:assert/strict';
import {DOMAINS, buildCatalog} from './catalog';

const tool = (name: string) => ({name, description: `${name} 설명입니다. 두 번째 문장.`, scope: 'classroom:read'});
const tools = DOMAINS.flatMap(domain => domain.tools).map(tool);

const full = buildCatalog(tools, {playground: true, cards: false});
assert.ok(full.domains.every(domain => domain.tools.every(name => tools.some(entry => entry.name === name))), 'only real tools are listed');
assert.equal(full.domains.find(domain => domain.key === 'cards')?.enabled, false, 'switched-off menus are marked');
assert.ok(!full.rules.some(rule => rule.includes('카드놀이 /teacher/cards')), 'a switched-off menu has no shortcut');
const open = buildCatalog(tools, {playground: true, cards: true});
assert.equal(open.domains.find(domain => domain.key === 'cards')?.enabled, true);
assert.ok(open.rules.some(rule => rule.includes('카드놀이 /teacher/cards')), 'the open menu gets its shortcut');
assert.ok(open.domains.find(domain => domain.key === 'cards')?.holds.some(item => item.includes('많이 틀린 단어')), 'the table says what Berry can read');
assert.equal(full.domains.find(domain => domain.key === 'kids_daily')?.tools.length, 0, 'Kids Daily has no reading tool, only a count in signals');
assert.ok(full.rules.some(rule => rule.includes('가명')), 'privacy rules travel with the table');
assert.ok(full.rules.some(rule => rule.includes('숙제 /teacher/homework')), 'menu links travel with the table');
assert.ok(full.rules.some(rule => rule.includes('작품전시 /teacher/exhibitions')));
assert.equal(full.tools.find(row => row.name === 'get_signals')?.summary, 'get_signals 설명입니다.', 'summaries keep the first sentence');

// A tool nobody filed still shows up, so the table never falls behind the code.
const grown = buildCatalog([...tools, tool('get_new_menu_status')], {playground: true, cards: false});
assert.deepEqual(grown.domains.at(-1)?.tools, ['get_new_menu_status']);
assert.equal(grown.tools.at(-1)?.domain, 'other');
assert.notEqual(grown.version, full.version, 'a new tool changes the version');
assert.equal(buildCatalog(tools, {playground: true, cards: false}).version, full.version, 'same inputs, same version');
assert.notEqual(buildCatalog(tools, {playground: false, cards: false}).version, full.version, 'a switch change changes the version');

// A grant without write scopes sees a smaller table: domains with no usable tool disappear.
const readOnly = buildCatalog(tools.filter(entry => !entry.name.startsWith('create_') && !entry.name.startsWith('approve_') && entry.name !== 'publish_review' && entry.name !== 'confirm_write'), {});
assert.ok(!readOnly.domains.some(domain => domain.key === 'confirm'));
// Berry's brain renders the table into at most 14,000 characters; each new tool row adds about 200 bytes here.
assert.ok(open.rules.some(rule => rule.includes('기본 어휘')) && open.domains.find(domain => domain.key === 'cards')?.tools.includes('find_base_vocab'), 'base vocabulary: Berry looks words up, the teacher makes sets');
assert.ok(new TextEncoder().encode(JSON.stringify(full)).length < 18_000, 'the whole table stays small');
assert.ok(full.domains.every(domain => domain.key !== 'other'), 'every tool has a menu (no 기타)');
console.log('catalog tests ok');
