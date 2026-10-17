import { test } from 'node:test';
import assert from 'node:assert/strict';

import { chooseSchedule } from '../src/active-source.ts';
import type { Snapshot, SourceName } from '../src/schedule.ts';

const MIN = 60_000;
const now = Date.parse('2026-10-18T00:00:00Z'); // 03:00 Kyiv
const snap = (source: SourceName, updatedAt: number): Snapshot => ({ source, updatedAt, days: {} });

test('fresh DTEK wins even when Yasno claims a newer update', () => {
  const choice = chooseSchedule({
    dtek: { snapshot: snap('dtek', now - 60 * MIN), lastOkAt: now - 5 * MIN },
    yasno: { snapshot: snap('yasno', now - 1 * MIN), lastOkAt: now - 1 * MIN },
  }, now);
  assert.deepEqual(choice, { snapshot: snap('dtek', now - 60 * MIN), stale: false });
});

test('DTEK silent for over 30 minutes: newer Yasno becomes the Active Source', () => {
  const choice = chooseSchedule({
    dtek: { snapshot: snap('dtek', now - 120 * MIN), lastOkAt: now - 31 * MIN },
    yasno: { snapshot: snap('yasno', now - 10 * MIN), lastOkAt: now - 2 * MIN },
  }, now);
  assert.deepEqual(choice, { snapshot: snap('yasno', now - 10 * MIN), stale: false });
});

test('DTEK silent, Yasno older than the last DTEK Schedule: keep DTEK as a Stale Schedule', () => {
  // DTEK changed the schedule at 02:00, then got blocked; Yasno still has the evening version.
  const choice = chooseSchedule({
    dtek: { snapshot: snap('dtek', now - 60 * MIN), lastOkAt: now - 45 * MIN },
    yasno: { snapshot: snap('yasno', now - 8 * 60 * MIN), lastOkAt: now - 2 * MIN },
  }, now);
  assert.deepEqual(choice, { snapshot: snap('dtek', now - 60 * MIN), stale: true });
});

test('both Sources silent: the chosen Schedule is stale', () => {
  const choice = chooseSchedule({
    dtek: { snapshot: snap('dtek', now - 300 * MIN), lastOkAt: now - 200 * MIN },
    yasno: { snapshot: snap('yasno', now - 100 * MIN), lastOkAt: now - 40 * MIN },
  }, now);
  assert.deepEqual(choice, { snapshot: snap('yasno', now - 100 * MIN), stale: true });
});

test('nothing fetched yet: no Schedule', () => {
  assert.equal(chooseSchedule({ dtek: {}, yasno: {} }, now), null);
});

test('Yasno preferred: fresh Yasno wins even when DTEK has a newer update', () => {
  const choice = chooseSchedule({
    dtek: { snapshot: snap('dtek', now - 1 * MIN), lastOkAt: now - 1 * MIN },
    yasno: { snapshot: snap('yasno', now - 60 * MIN), lastOkAt: now - 5 * MIN },
  }, now, 'yasno');
  assert.deepEqual(choice, { snapshot: snap('yasno', now - 60 * MIN), stale: false });
});

test('Yasno preferred but silent: newer DTEK becomes the Active Source', () => {
  const choice = chooseSchedule({
    dtek: { snapshot: snap('dtek', now - 10 * MIN), lastOkAt: now - 2 * MIN },
    yasno: { snapshot: snap('yasno', now - 120 * MIN), lastOkAt: now - 31 * MIN },
  }, now, 'yasno');
  assert.deepEqual(choice, { snapshot: snap('dtek', now - 10 * MIN), stale: false });
});

test('Yasno preferred but silent, DTEK older: keep Yasno as a Stale Schedule', () => {
  const choice = chooseSchedule({
    dtek: { snapshot: snap('dtek', now - 8 * 60 * MIN), lastOkAt: now - 2 * MIN },
    yasno: { snapshot: snap('yasno', now - 60 * MIN), lastOkAt: now - 45 * MIN },
  }, now, 'yasno');
  assert.deepEqual(choice, { snapshot: snap('yasno', now - 60 * MIN), stale: true });
});
