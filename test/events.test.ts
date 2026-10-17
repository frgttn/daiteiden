import { test } from 'node:test';
import assert from 'node:assert/strict';

import { detectEvents } from '../src/events.ts';
import type { PowerState } from '../src/schedule.ts';

// Build a day from a drawing: "." on, "X" off, "?" possible off; padded with "." to 48 Slots.
const day = (drawing: string): PowerState[] =>
  drawing.padEnd(48, '.').split('').map((c) => ({ '.': 'on', X: 'off', '?': 'possible' })[c] as PowerState);

const at = (iso: string) => Date.parse(iso);
const noon17 = at('2026-10-17T09:00:00Z'); // 12:00 Kyiv, Slot 24

test('tomorrow appearing for the first time is a Publication', () => {
  const told = { '2026-10-17': day('') };
  const current = { '2026-10-17': day(''), '2026-10-18': day('XXXX') };
  assert.deepEqual(detectEvents(told, current, noon17), [{ kind: 'published', date: '2026-10-18' }]);
});

test('a later Slot today changing is a Schedule Change with before and after', () => {
  const before = day('');
  const after = day('.'.repeat(34) + 'XXXX');
  assert.deepEqual(detectEvents({ '2026-10-17': before }, { '2026-10-17': after }, noon17), [
    { kind: 'changed', date: '2026-10-17', before, after },
  ]);
});

test('a change in the current Slot counts', () => {
  const after = day('.'.repeat(24) + 'X');
  assert.equal(detectEvents({ '2026-10-17': day('') }, { '2026-10-17': after }, noon17).length, 1);
});

test('a change only in Slots that are already over is not a Schedule Change', () => {
  assert.deepEqual(detectEvents({ '2026-10-17': day('') }, { '2026-10-17': day('XXXX') }, noon17), []);
});

test('the same Schedule again is nothing', () => {
  assert.deepEqual(detectEvents({ '2026-10-17': day('XX') }, { '2026-10-17': day('XX') }, noon17), []);
});

test('yesterday dropping out of the Source is nothing', () => {
  const told = { '2026-10-16': day('XX'), '2026-10-17': day('') };
  assert.deepEqual(detectEvents(told, { '2026-10-17': day('') }, noon17), []);
});

test('Emergency Mode starting and ending', () => {
  assert.deepEqual(detectEvents({ '2026-10-17': day('') }, { '2026-10-17': 'emergency' }, noon17), [
    { kind: 'emergency-started', date: '2026-10-17' },
  ]);
  assert.deepEqual(detectEvents({ '2026-10-17': 'emergency' }, { '2026-10-17': day('') }, noon17), [
    { kind: 'emergency-ended', date: '2026-10-17' },
  ]);
});
