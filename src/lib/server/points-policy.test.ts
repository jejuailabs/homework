import {test} from 'node:test';
import assert from 'node:assert/strict';
import {equipWardrobe, parsePointSettings, pointAwardDecision, pointBalance, pointInteger, pointLedgerId, pointPurchaseDecision, pointSettings, wardrobeOutfit, wardrobeOwnership} from './points-policy';
import {wardrobeCatalog} from '../points-types';

test('points are disabled by default and old daily limits are ignored', () => {
  assert.equal(pointSettings(undefined).enabled, false);
  assert.equal(pointSettings({enabled: 'true'}).enabled, false);
  assert.deepEqual(pointSettings({enabled: true, dailyCap: 1, rules: {homework: NaN}}), {enabled: true, label: '보말', rules: {homework: 10}});
  assert.deepEqual(parsePointSettings({enabled: true, label: '조개', dailyCap: 100, rules: {homework: 0}}), {enabled: true, label: '조개', rules: {homework: 0}});
  assert.equal(pointSettings({rules: {homework: 5000}}).rules.homework, 5000);
  assert.equal(parsePointSettings({enabled: true, label: '조개', rules: {homework: 5000}}).rules.homework, 5000);
  for (const v of [-1, 0, 1.5, '10', NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => pointInteger(v, 1, Number.MAX_SAFE_INTEGER));
  assert.throws(() => parsePointSettings({enabled: true, label: 'a', rules: {homework: -1}}));
});
test('teacher awards have no daily or per-award cap while preserving integer balances', () => {
  const settings = pointSettings({enabled: true, dailyCap: 100});
  assert.deepEqual(pointAwardDecision(settings, 40, 5000), {balance: 5040});
  assert.deepEqual(pointAwardDecision(settings, 5040, 10000), {balance: 15040});
  assert.throws(() => pointAwardDecision({...settings, enabled: false}, 40, 10), (e: any) => e.code === 'POINTS_DISABLED');
  assert.throws(() => pointAwardDecision(settings, Number.MAX_SAFE_INTEGER, 1), (e: any) => e.code === 'POINT_BALANCE');
  assert.deepEqual(pointAwardDecision(settings, 0, Number.MAX_SAFE_INTEGER), {balance: Number.MAX_SAFE_INTEGER});
});
test('ledger keys are stable, separate sources/students, and cannot collide via separators', () => {
  assert.equal(pointLedgerId('homework', 'task1', 's1'), pointLedgerId('homework', 'task1', 's1'));
  assert.notEqual(pointLedgerId('homework', 'task1', 's1'), pointLedgerId('manual', 'task1', 's1'));
  assert.notEqual(pointLedgerId('manual', 'a_b', 'c'), pointLedgerId('manual', 'a', 'b_c'));
  assert.notEqual(pointLedgerId('wardrobe', 'head-crown', 's1'), pointLedgerId('wardrobe', 'head-crown', 's2'));
});
test('purchases use server catalogue prices and a repeated ownership check cannot charge twice', () => {
  const item = wardrobeCatalog.find(item => item.id === 'head-crown')!;
  const purchased = pointPurchaseDecision(item.price, [], item.id);
  assert.equal(purchased.balance, 0);
  assert.equal(purchased.purchased, true);
  assert.ok(purchased.owned.includes(item.id));
  const repeated = pointPurchaseDecision(0, purchased.owned, item.id);
  assert.equal(repeated.purchased, false); assert.equal(repeated.balance, 0);
  assert.throws(() => pointPurchaseDecision(item.price - 1, [], item.id), (e: any) => e.code === 'POINTS_INSUFFICIENT');
  assert.throws(() => pointPurchaseDecision(999, [], 'invented-item'));
});
test('starter items are always owned, unknown stored items are discarded', () => {
  assert.equal(wardrobeOwnership(['head-sprout', 'not-a-real-item', 'head-sprout']).filter(item => item === 'head-sprout').length, 1);
  assert.equal(wardrobeOwnership([]).length, 3);
  assert.equal(pointPurchaseDecision(0, [], 'head-sprout').purchased, false);
  assert.ok(wardrobeCatalog.filter(item => item.price > 0).length >= 12);
  assert.equal(new Set(wardrobeCatalog.map(item => item.id)).size, wardrobeCatalog.length);
});
test('equip validates both ownership and slot, and safely removes one decoration', () => {
  assert.throws(() => equipWardrobe({}, [], 'head', 'head-crown'), (e: any) => e.code === 'ITEM_NOT_OWNED');
  assert.throws(() => equipWardrobe({}, ['head-crown'], 'neck', 'head-crown'), (e: any) => e.code === 'ITEM_NOT_OWNED');
  assert.deepEqual(equipWardrobe({}, [], 'head', 'head-sprout'), {head: 'head-sprout'});
  assert.deepEqual(equipWardrobe({head: 'head-sprout', background: 'background-cloud'}, [], 'head', null), {background: 'background-cloud'});
  assert.deepEqual(wardrobeOutfit({head: 'head-crown', background: 'head-sprout', arbitrary: 'head-sprout'}, []), {});
});
test('balances cannot expose invalid, negative, or unsafe stored numbers', () => {
  for (const value of [-10, NaN, Infinity, '200', Number.MAX_SAFE_INTEGER + 1]) assert.equal(pointBalance(value), 0);
  assert.equal(pointBalance(0), 0); assert.equal(pointBalance(75), 75);
});
