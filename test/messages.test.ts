import { test } from 'node:test';
import assert from 'node:assert/strict';

import { renderEvent, renderReminder, renderSchedule, renderStatus } from '../src/messages.ts';
import type { PowerState } from '../src/schedule.ts';

const day = (drawing: string): PowerState[] =>
  drawing.padEnd(48, '.').split('').map((c) => ({ '.': 'on', X: 'off', '?': 'possible' })[c] as PowerState);
const k = (date: string, time: string) => Date.parse(`${date}T${time}:00+03:00`);

test('schedule for today and tomorrow, tomorrow not published yet', () => {
  const days = { '2026-10-17': day('.'.repeat(34) + 'X'.repeat(7) + '..??') };
  assert.equal(renderSchedule(days, '3.2', k('2026-10-17', '12:00')), [
    '<b>Черга 3.2</b>',
    '',
    '<b>Сьогодні, 17 жовтня</b>',
    '🔴 17:00–20:30 відключення',
    '🟡 21:30–22:30 можливе відключення',
    '',
    '<b>Завтра, 18 жовтня</b>',
    'Графік ще не опубліковано.',
  ].join('\n'));
});

test('schedule days without outages and in Emergency Mode', () => {
  const days = { '2026-10-17': day(''), '2026-10-18': 'emergency' as const };
  assert.equal(renderSchedule(days, '1.1', k('2026-10-17', '12:00')), [
    '<b>Черга 1.1</b>',
    '',
    '<b>Сьогодні, 17 жовтня</b>',
    'Відключень не заплановано.',
    '',
    '<b>Завтра, 18 жовтня</b>',
    '🚨 Аварійні відключення, графік не діє.',
  ].join('\n'));
});

test('a Schedule Change shows before and after, and warns about an Outage within 30 minutes', () => {
  const before = day('');
  const after = day('.'.repeat(28) + 'XXXX');
  const now = k('2026-10-17', '13:50');
  assert.equal(renderEvent({ kind: 'changed', date: '2026-10-17', before, after }, { '2026-10-17': after }, '3.2', now), [
    '<b>Зміна графіка на сьогодні</b>',
    '⚠️ Відключення о 14:00, через 10 хв.',
    '',
    'Було: відключень немає',
    'Стало: 14:00–16:00',
    '',
    '<b>Черга 3.2</b>',
    '',
    '<b>Сьогодні, 17 жовтня</b>',
    '🔴 14:00–16:00 відключення',
    '',
    '<b>Завтра, 18 жовтня</b>',
    'Графік ще не опубліковано.',
  ].join('\n'));
});

test('Reminder texts', () => {
  assert.equal(
    renderReminder({ kind: 'outage-starts', at: 0, start: k('2026-10-17', '17:00'), end: k('2026-10-17', '20:30') }),
    '🔴 О 17:00 відключення, до 20:30.',
  );
  assert.equal(
    renderReminder({ kind: 'outage-starts', at: 0, start: k('2026-10-17', '22:00'), end: null }),
    '🔴 О 22:00 відключення. Коли повернеться світло, ще невідомо.',
  );
  assert.equal(renderReminder({ kind: 'outage-ends', at: 0, end: k('2026-10-17', '20:30') }), '🟢 О 20:30 має повернутися світло.');
  assert.equal(
    renderReminder({ kind: 'outage-ends-into-possible', at: 0, end: k('2026-10-17', '18:00'), possibleUntil: k('2026-10-17', '19:00') }),
    '🟡 О 18:00 відключення закінчується, далі можливе відключення до 19:00.',
  );
  assert.equal(
    renderReminder({ kind: 'possible-starts', at: 0, start: k('2026-10-17', '10:00'), end: k('2026-10-17', '11:00') }),
    '🟡 О 10:00 можливе відключення, до 11:00.',
  );
});

test('status now: during an Outage and with power', () => {
  const days = { '2026-10-17': day('.'.repeat(34) + 'X'.repeat(7)) };
  assert.equal(renderStatus(days, k('2026-10-17', '18:15')), '🔴 Зараз відключення. Світло має повернутися о 20:30, через 2 год 15 хв.');
  assert.equal(renderStatus(days, k('2026-10-17', '12:00')), '🟢 Зараз світло має бути. Наступне відключення о 17:00, через 5 год.');
  assert.equal(renderStatus(days, k('2026-10-17', '21:00')), '🟢 Зараз світло має бути. Відключень далі в графіку немає.');
  assert.equal(renderStatus({}, k('2026-10-17', '21:00')), 'Графіка на сьогодні немає.');
});
