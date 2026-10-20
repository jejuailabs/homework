import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BASE_PLAN_BYTES, GIB, daysUntil, fitsPlan, formatStorage, planPeriodEnd, usageLevel} from './storage-plan';
import {stableReadWindow} from './storage-cache';

test('the base plan is 200GB for one year, and pending uploads count against it',()=>{
  assert.equal(BASE_PLAN_BYTES,200*GIB);
  assert.equal(planPeriodEnd('2026-10-20T00:00:00.000Z'),'2027-10-20T00:00:00.000Z');
  assert.equal(fitsPlan(150*GIB,49*GIB,GIB,BASE_PLAN_BYTES),true);
  assert.equal(fitsPlan(150*GIB,49*GIB,GIB+1,BASE_PLAN_BYTES),false);
});
test('usage warns at 80% and turns critical at 95%',()=>{
  assert.equal(usageLevel(159*GIB,200*GIB),'ok');
  assert.equal(usageLevel(160*GIB,200*GIB),'warn');
  assert.equal(usageLevel(190*GIB,200*GIB),'critical');
});
test('days until reset round up and never go negative',()=>{
  const now=Date.parse('2026-10-20T09:00:00.000Z');
  assert.equal(daysUntil('2026-10-21T08:00:00.000Z',now),1);
  assert.equal(daysUntil('2026-10-19T00:00:00.000Z',now),0);
  assert.equal(formatStorage(143.24*GIB),'143GB');
  assert.equal(formatStorage(56.8*GIB),'56.8GB');
});
test('read links stay identical for a whole day and are valid at least 24 hours',()=>{
  const morning=Date.parse('2026-10-20T00:10:00.000Z'),night=Date.parse('2026-10-20T23:50:00.000Z');
  assert.deepEqual(stableReadWindow(morning),stableReadWindow(night));
  assert.ok(stableReadWindow(night).expires.getTime()-night>=24*3_600_000);
  assert.notDeepEqual(stableReadWindow(night),stableReadWindow(night+20*60_000));
});
