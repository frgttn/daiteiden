import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { parseDtek } from '../src/sources/dtek.ts';
import { parseYasno } from '../src/sources/yasno.ts';
import type { GroupDay } from '../src/schedule.ts';

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));

// One character per 30-minute Slot: "." on, "X" off, "?" possible off.
const draw = (day: GroupDay | undefined) =>
  Array.isArray(day) ? day.map((s) => ({ on: '.', off: 'X', possible: '?' })[s]).join('') : day;

test('DTEK: Group 3.2 is off 17:00–20:30 on 17 October', () => {
  const snapshot = parseDtek(fixture('dtek-2026-10-17.json'));
  assert.equal(draw(snapshot.days['2026-10-17']['3.2']), '.'.repeat(34) + 'X'.repeat(7) + '.'.repeat(7));
});

test('DTEK: update time is read as Kyiv time', () => {
  assert.equal(parseDtek(fixture('dtek-2026-10-17.json')).updatedAt, Date.parse('2026-10-17T07:41:00Z'));
});

test('DTEK: winter update time uses UTC+2', () => {
  const snapshot = parseDtek({ update: '05.01.2027 02:10', data: {} });
  assert.equal(snapshot.updatedAt, Date.parse('2027-01-05T00:10:00Z'));
});

test('DTEK: half-hour and possible statuses map to Slots', () => {
  const hours = Object.fromEntries(Array.from({ length: 24 }, (_, i) => [String(i + 1), 'yes']));
  Object.assign(hours, { 1: 'first', 2: 'second', 3: 'maybe', 4: 'mfirst', 5: 'msecond', 6: 'no' });
  const snapshot = parseDtek({ update: '17.10.2026 10:41', data: { '1792184400': { 'GPV1.1': hours } } });
  assert.equal(draw(snapshot.days['2026-10-17']['1.1']), 'X..X???..?XX' + '.'.repeat(36));
});

test('DTEK: an unknown status is a parse error, not a guess', () => {
  const hours = Object.fromEntries(Array.from({ length: 24 }, (_, i) => [String(i + 1), 'yes']));
  hours['7'] = 'emergency';
  assert.throws(() => parseDtek({ update: '17.10.2026 10:41', data: { '1792184400': { 'GPV1.1': hours } } }), /emergency/);
});

const yasnoDay = (date: string, status: string, slots: { start: number; end: number; type: string }[]) => ({
  '1.1': { today: { date: `${date}T00:00:00+03:00`, status, slots }, tomorrow: { date: '2026-10-18T00:00:00+03:00', status: 'WaitingForSchedule', slots: [] }, updatedOn: '2026-10-17T07:55:37+00:00' },
});

test('Yasno: Group 3.2 is off 17:00–20:30 on 17 October, tomorrow is not published yet', () => {
  const snapshot = parseYasno(fixture('yasno-2026-10-17.json'));
  assert.equal(draw(snapshot.days['2026-10-17']['3.2']), '.'.repeat(34) + 'X'.repeat(7) + '.'.repeat(7));
  assert.equal(snapshot.days['2026-10-18']?.['3.2'], undefined);
  assert.equal(snapshot.updatedAt, Date.parse('2026-10-17T07:55:37Z'));
});

test('Yasno: NoOutages is a day with power all day', () => {
  const snapshot = parseYasno(yasnoDay('2026-10-17', 'NoOutages', []));
  assert.equal(draw(snapshot.days['2026-10-17']['1.1']), '.'.repeat(48));
});

test('Yasno: EmergencyShutdowns is Emergency Mode', () => {
  const snapshot = parseYasno(yasnoDay('2026-10-17', 'EmergencyShutdowns', []));
  assert.equal(snapshot.days['2026-10-17']['1.1'], 'emergency');
});

test('Yasno: a range that ends mid-Slot makes the whole Slot off', () => {
  const snapshot = parseYasno(yasnoDay('2026-10-17', 'ScheduleApplies', [
    { start: 0, end: 15, type: 'NotPlanned' }, { start: 15, end: 45, type: 'Definite' }, { start: 45, end: 1440, type: 'NotPlanned' },
  ]));
  assert.equal(draw(snapshot.days['2026-10-17']['1.1']), 'XX' + '.'.repeat(46));
});

test('Yasno: an unknown slot type is a parse error', () => {
  assert.throws(() => parseYasno(yasnoDay('2026-10-17', 'ScheduleApplies', [{ start: 0, end: 1440, type: 'Mystery' }])), /Mystery/);
});
