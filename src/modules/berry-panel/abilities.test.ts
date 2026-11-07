import assert from 'node:assert/strict';
import {BERRY_SCOPES, WRITE_SCOPES} from '../berry-connector/types';
import {ABILITY_GROUPS, abilityGroups, lackingFor, missingPermissions} from './abilities';

const all = ABILITY_GROUPS.flatMap(group => group.abilities);
assert.deepEqual(missingPermissions(BERRY_SCOPES).scopes, [], 'a full connection unlocks every button');
for (const ability of all) {
  assert.ok(ability.needs.every(scope => BERRY_SCOPES.includes(scope)), `${ability.label}: unknown permission`);
  if (ability.write) assert.ok(ability.needs.some(scope => WRITE_SCOPES.includes(scope)), `${ability.label}: a write button needs a write permission`);
  else assert.ok(!ability.needs.some(scope => WRITE_SCOPES.includes(scope)), `${ability.label}: a read button must not need a write permission`);
}
const byLabel = (label: string) => all.find(ability => ability.label === label)!;
// The connection made before classroom permissions existed: storage must lock and ask for a reconnect, not fail in chat.
const old = ['classes:read', 'homework:read', 'notebook:read', 'workspace:read', 'events:read', 'calendar:write', 'workspace:write', 'notebook:write'];
assert.deepEqual(lackingFor(byLabel('저장 공간'), old), ['classroom:read']);
assert.deepEqual(lackingFor(byLabel('일정 넣기'), old), [], 'buttons this connection can run stay open');
assert.deepEqual(lackingFor(byLabel('알림 예약'), []), [], 'reminders run on Berry and need no permission');
assert.deepEqual(missingPermissions(old).scopes.sort(), ['classroom:read', 'classroom:write']);
// A switched-off menu drops its button and nothing else.
const shown = abilityGroups(['cards', 'notebook']).flatMap(group => group.abilities.map(ability => ability.label));
assert.ok(!shown.includes('카드 배부') && !shown.includes('카드 진도') && !shown.includes('교무수첩 기록'));
assert.equal(shown.length, all.length - 3);
assert.equal(abilityGroups().flatMap(group => group.abilities).length, all.length);
