import { test } from 'node:test';
import assert from 'node:assert/strict';

import { dueReminders } from '../src/reminders.ts';
import type { PowerState } from '../src/schedule.ts';

const day = (drawing: string): PowerState[] =>
  drawing.padEnd(48, '.').split('').map((c) => ({ '.': 'on', X: 'off', '?': 'possible' })[c] as PowerState);
// Kyiv wall clock on 17–18 October 2026 (UTC+3).
const k = (date: string, time: string) => Date.parse(`${date}T${time}:00+03:00`);
const wholeDay = { from: k('2026-10-16', '23:59'), to: k('2026-10-18', '23:59') };
const opts = { possible: true };

test('an Outage gets a Reminder 30 minutes before it starts (with its end) and before it ends', () => {
  const days = { '2026-10-17': day('.'.repeat(34) + 'X'.repeat(7)) };
  assert.deepEqual(dueReminders(days, wholeDay.from, wholeDay.to, opts), [
    { kind: 'outage-starts', at: k('2026-10-17', '16:30'), start: k('2026-10-17', '17:00'), end: k('2026-10-17', '20:30') },
    { kind: 'outage-ends', at: k('2026-10-17', '20:00'), end: k('2026-10-17', '20:30') },
  ]);
});

test('a 30-minute Outage has no end Reminder', () => {
  const days = { '2026-10-17': day('.'.repeat(28) + 'X') };
  assert.deepEqual(dueReminders(days, wholeDay.from, wholeDay.to, opts).map((r) => r.kind), ['outage-starts']);
});

test('an Outage followed by Possible Off ends with "possible off until" instead of restoration', () => {
  const days = { '2026-10-17': day('.'.repeat(34) + 'XX??') };
  assert.deepEqual(dueReminders(days, wholeDay.from, wholeDay.to, opts), [
    { kind: 'outage-starts', at: k('2026-10-17', '16:30'), start: k('2026-10-17', '17:00'), end: k('2026-10-17', '18:00') },
    { kind: 'outage-ends-into-possible', at: k('2026-10-17', '17:30'), end: k('2026-10-17', '18:00'), possibleUntil: k('2026-10-17', '19:00') },
  ]);
});

test('Possible Off on its own gets a Reminder only when the Subscriber wants them', () => {
  const days = { '2026-10-17': day('.'.repeat(20) + '??') };
  assert.deepEqual(dueReminders(days, wholeDay.from, wholeDay.to, opts), [
    { kind: 'possible-starts', at: k('2026-10-17', '09:30'), start: k('2026-10-17', '10:00'), end: k('2026-10-17', '11:00') },
  ]);
  assert.deepEqual(dueReminders(days, wholeDay.from, wholeDay.to, { possible: false }), []);
});

test('an Outage across midnight ends on the next day', () => {
  const days = { '2026-10-17': day('.'.repeat(46) + 'XX'), '2026-10-18': day('XXXX') };
  assert.deepEqual(dueReminders(days, wholeDay.from, wholeDay.to, opts), [
    { kind: 'outage-starts', at: k('2026-10-17', '22:30'), start: k('2026-10-17', '23:00'), end: k('2026-10-18', '02:00') },
    { kind: 'outage-ends', at: k('2026-10-18', '01:30'), end: k('2026-10-18', '02:00') },
  ]);
});

test('an Outage that runs into an unpublished day has no known end', () => {
  const days = { '2026-10-17': day('.'.repeat(44) + 'XXXX') };
  assert.deepEqual(dueReminders(days, wholeDay.from, wholeDay.to, opts), [
    { kind: 'outage-starts', at: k('2026-10-17', '21:30'), start: k('2026-10-17', '22:00'), end: null },
  ]);
});

test('only Reminders due after the last tick and up to now', () => {
  // The schedule changed at 13:50 to add an Outage at 14:00: the 13:30 Reminder is already gone.
  const days = { '2026-10-17': day('.'.repeat(28) + 'XXXX') };
  assert.deepEqual(dueReminders(days, k('2026-10-17', '13:45'), k('2026-10-17', '13:50'), opts), []);
  assert.deepEqual(dueReminders(days, k('2026-10-17', '13:25'), k('2026-10-17', '13:30'), opts).map((r) => r.kind), ['outage-starts']);
});

test('no Reminders during Emergency Mode', () => {
  assert.deepEqual(dueReminders({ '2026-10-17': 'emergency' }, wholeDay.from, wholeDay.to, opts), []);
});
