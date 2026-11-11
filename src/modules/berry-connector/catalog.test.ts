import assert from 'node:assert/strict';
import {CATALOG_RULES, DOMAINS, GUIDE_BUDGET, ROOT_BUDGET, RULE_LIMIT, WHAT_LIMIT, buildCatalog, catalogBudget, flatCatalog} from './catalog';

const tool = (name: string) => ({name, description: `${name} 설명입니다. 두 번째 문장.`, scope: 'classroom:read'});
const tools = DOMAINS.flatMap(domain => domain.tools).map(tool);
const menu = (catalog: ReturnType<typeof buildCatalog>, key: string) => catalog.domains.find(domain => domain.key === key);

const full = buildCatalog(tools, {playground: true, cards: false});
assert.equal(full.tree, true, 'the table says it is a tree, so the brain reads the root only');
assert.ok(full.domains.every(domain => domain.tools.every(name => tools.some(entry => entry.name === name))), 'only real tools are listed');
assert.equal(menu(full, 'cards')?.enabled, false, 'switched-off menus are marked');
const open = buildCatalog(tools, {playground: true, cards: true});
assert.equal(menu(open, 'cards')?.enabled, true);
assert.equal(menu(full, 'kids_daily')?.tools.length, 0, 'Kids Daily has no reading tool, only a count in signals');
assert.equal(open.tools.find(row => row.name === 'get_dictionary_info')?.domain, 'dictionary');
assert.equal(buildCatalog(tools, {dictionary: false}).domains.find(domain => domain.key === 'dictionary')?.enabled, false);

// Links ride on the menu's own line, not in a rule.
assert.equal(menu(full, 'homework')?.link, '/teacher/homework');
assert.equal(menu(full, 'exhibitions')?.link, '/teacher/exhibitions');
assert.equal(menu(open, 'dictionary')?.link, '/teacher/tools/dictionary');
assert.ok(full.domains.every(domain => domain.link === null || domain.link.startsWith('/teacher')));

// Rules that hold everywhere stay in the root; one menu's know-how lives in that menu's guide.
assert.ok(full.rules.some(rule => rule.includes('가명')), 'privacy rules travel with the root');
assert.ok(full.rules.some(rule => rule.includes('[이름](주소)')), 'the link rule travels with the root');
assert.ok(!full.rules.some(rule => rule.includes('카드놀이') || rule.includes('국어사전') || rule.includes('동네 탐험')), 'no menu-specific rule in the root');
assert.ok(menu(open, 'cards')?.guide.some(line => line.includes('create_set') && line.includes('create_review_set')), 'Berry knows it can make card sets and review sets');
assert.ok(menu(open, 'cards')?.guide.some(line => line.includes('많이 틀린 단어')), 'the cards guide says what Berry can read');
assert.ok(menu(open, 'cards')?.guide.some(line => line.includes('기본 어휘')) && menu(open, 'cards')?.tools.includes('find_base_vocab'), 'base vocabulary: Berry looks words up, the teacher makes sets');
assert.ok(menu(open, 'dictionary')?.guide.some(line => line.includes('기기 단어장·최근 검색어는 볼 수 없다')));
assert.ok(menu(full, 'homework')?.guide.some(line => line.includes('manage_homework edit')), 'homework edits stay with Berry');

// Tool rows only place a tool; its description arrives with the tool itself.
assert.deepEqual(Object.keys(full.tools[0]).sort(), ['domain', 'name', 'scope']);

// A tool nobody filed still shows up, so the table never falls behind the code.
const grown = buildCatalog([...tools, tool('get_new_menu_status')], {playground: true, cards: false});
assert.deepEqual(grown.domains.at(-1)?.tools, ['get_new_menu_status']);
assert.equal(grown.tools.at(-1)?.domain, 'other');
assert.notEqual(grown.version, full.version, 'a new tool changes the version');
assert.equal(buildCatalog(tools, {playground: true, cards: false}).version, full.version, 'same inputs, same version');
assert.notEqual(buildCatalog(tools, {playground: false, cards: false}).version, full.version, 'a switch change changes the version');
assert.ok(full.domains.every(domain => domain.key !== 'other'), 'every tool has a menu (no 기타)');

// A grant without write scopes sees a smaller table: domains with no usable tool disappear.
const readOnly = buildCatalog(tools.filter(entry => !entry.name.startsWith('create_') && !entry.name.startsWith('approve_') && entry.name !== 'publish_review' && entry.name !== 'confirm_write'), {});
assert.ok(!readOnly.domains.some(domain => domain.key === 'confirm'));

// The tree keeps its shape as features are added. The root is read on every question, so it grows only with a new
// menu; a feature inside a menu goes into that menu's guide, and a guide that outgrows its budget becomes two menus.
const budget = catalogBudget(open);
assert.ok(budget.root <= ROOT_BUDGET, `the root stays under ${ROOT_BUDGET} characters (now ${budget.root})`);
for (const [key, size] of Object.entries(budget.guides)) assert.ok(size <= GUIDE_BUDGET, `the ${key} guide stays under ${GUIDE_BUDGET} characters (now ${size}); split the menu instead of growing it`);
assert.ok(CATALOG_RULES.length <= RULE_LIMIT, `at most ${RULE_LIMIT} root rules; put a menu's rule in its guide`);
for (const domain of DOMAINS) {
  assert.ok(domain.what.length <= WHAT_LIMIT, `${domain.key}: the root line stays under ${WHAT_LIMIT} characters`);
  assert.ok(domain.guide.every(line => line.length <= 600), `${domain.key}: one guide line stays under 600 characters`);
  assert.ok(domain.key === 'confirm' || domain.words.length > 0, `${domain.key}: say what teachers call this menu`);
}
console.log(`catalog tests ok (root ${budget.root}, largest guide ${Math.max(...Object.values(budget.guides))})`);

// A client that does not ask for the tree still gets everything, flattened the way it always read it.

const flat = flatCatalog(open, tools);
assert.ok(!('tree' in flat), 'the flat form does not claim to be a tree');
assert.ok(flat.rules.some(rule => rule.includes('가명')));
assert.ok(flat.rules.some(rule => rule.startsWith('카드놀이: ') && rule.includes('create_set') && rule.includes('create_review_set')), 'menu guides travel as rules');
assert.ok(flat.rules.some(rule => rule.includes('숙제 /teacher/homework') && rule.includes('Tools > 국어사전 /teacher/tools/dictionary')), 'menu links travel as one rule');
assert.ok(flat.rules.length <= 30 && flat.rules.every(rule => rule.length <= 800), 'within what an older client keeps');
assert.equal(flat.tools.find(row => row.name === 'get_signals')?.summary, 'get_signals 설명입니다.', 'summaries keep the first sentence');
assert.notEqual(flat.version, open.version);
const flatText = [...flat.domains.map(domain => `- ${domain.menu}: ${domain.what} | 지표 ${domain.metrics.join(', ')} | 도구 ${domain.tools.join(', ')} | 민감도 ${domain.sensitivity} | 비용 ${domain.cost}`), ...flat.tools.map(row => `- ${row.name}: ${row.summary.slice(0, 100)} [승인 카드]`), ...flat.rules.map(rule => `- ${rule}`)].join('\n').length;
assert.ok(flatText < 14_000, `the flat form fits an older client's 14,000 character limit (now about ${flatText})`);
console.log(`flat catalog ok (about ${flatText} characters, ${flat.rules.length} rules)`);
