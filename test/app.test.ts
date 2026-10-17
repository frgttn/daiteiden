import { test } from 'node:test';
import assert from 'node:assert/strict';

import { BlockedError, createApp, type Fetchers } from '../src/app.ts';
import type { PowerState, Snapshot, SourceName } from '../src/schedule.ts';

const day = (drawing: string): PowerState[] =>
  drawing.padEnd(48, '.').split('').map((c) => ({ '.': 'on', X: 'off', '?': 'possible' })[c] as PowerState);
const k = (date: string, time: string) => Date.parse(`${date}T${time}:00+03:00`);
const MIN = 60_000;

/** A world where each Source returns whatever the test last put there, or throws. */
function world() {
  const data: Record<SourceName, Snapshot | Error> = { dtek: new Error('not yet'), yasno: new Error('not yet') };
  const sent: { chatId: number; text: string }[] = [];
  const alerts: string[] = [];
  const blocked = new Set<number>();
  const fetchers: Fetchers = {
    dtek: async () => { const d = data.dtek; if (d instanceof Error) throw d; return d; },
    yasno: async () => { const d = data.yasno; if (d instanceof Error) throw d; return d; },
  };
  const app = createApp({
    dbPath: ':memory:',
    fetchers,
    send: async (chatId, text) => {
      if (blocked.has(chatId)) throw new BlockedError();
      sent.push({ chatId, text });
    },
    alertAdmin: async (text) => { alerts.push(text); },
  });
  const set = (source: SourceName, updatedAt: number, days: Snapshot['days'] | Error) => {
    data[source] = days instanceof Error ? days : { source, updatedAt, days };
  };
  return { app, set, sent, alerts, blocked };
}

test('a Subscriber gets a Publication once', async () => {
  const w = world();
  w.set('dtek', k('2026-10-17', '10:00'), { '2026-10-17': { '3.2': day('') } });
  await w.app.tick(k('2026-10-17', '10:05'));
  await w.app.subscribe(1, '3.2', k('2026-10-17', '10:06'));
  w.set('dtek', k('2026-10-17', '19:00'), { '2026-10-17': { '3.2': day('') }, '2026-10-18': { '3.2': day('XX') } });
  await w.app.tick(k('2026-10-17', '19:05'));
  await w.app.tick(k('2026-10-17', '19:10'));
  assert.equal(w.sent.length, 1);
  assert.match(w.sent[0].text, /Опубліковано графік на завтра/);
});

test('a Reminder is sent once, on the first tick at or after its time', async () => {
  const w = world();
  w.set('dtek', k('2026-10-17', '10:00'), { '2026-10-17': { '3.2': day('.'.repeat(34) + 'XXXX') } });
  await w.app.tick(k('2026-10-17', '16:20'));
  await w.app.subscribe(1, '3.2', k('2026-10-17', '16:21'));
  await w.app.tick(k('2026-10-17', '16:25'));
  assert.equal(w.sent.length, 0);
  await w.app.tick(k('2026-10-17', '16:31'));
  await w.app.tick(k('2026-10-17', '16:36'));
  assert.deepEqual(w.sent.map((m) => m.text), ['🔴 О 17:00 відключення, до 19:00.\n\n<i>Джерело: DTEK</i>']);
});

test('a Subscriber who blocked the bot is removed', async () => {
  const w = world();
  w.set('dtek', k('2026-10-17', '10:00'), { '2026-10-17': { '3.2': day('') } });
  await w.app.tick(k('2026-10-17', '10:05'));
  await w.app.subscribe(1, '3.2', k('2026-10-17', '10:06'));
  w.blocked.add(1);
  w.set('dtek', k('2026-10-17', '11:00'), { '2026-10-17': { '3.2': day('.'.repeat(40) + 'XX') } });
  await w.app.tick(k('2026-10-17', '11:05'));
  assert.equal(w.app.subscriber(1), undefined);
});

test('DTEK blocked at night, Yasno still has the old Schedule: no false change, the Admin is alerted once', async () => {
  const w = world();
  const evening = { '2026-10-17': { '3.2': day('') }, '2026-10-18': { '3.2': day('') } };
  const night = { '2026-10-17': { '3.2': day('') }, '2026-10-18': { '3.2': day('.'.repeat(16) + 'XXXX') } };
  w.set('yasno', k('2026-10-17', '20:00'), evening);
  w.set('dtek', k('2026-10-17', '20:00'), evening);
  await w.app.tick(k('2026-10-17', '21:00'));
  await w.app.subscribe(1, '3.2', k('2026-10-17', '21:01'));
  w.set('dtek', k('2026-10-18', '02:00'), night);
  await w.app.tick(k('2026-10-18', '02:05'));
  assert.equal(w.sent.length, 1); // the night change itself
  w.set('dtek', 0, new Error('Imperva captcha'));
  for (let t = k('2026-10-18', '02:10'); t <= k('2026-10-18', '03:30'); t += 5 * MIN) await w.app.tick(t);
  assert.equal(w.sent.length, 1);
  assert.equal(w.alerts.filter((a) => a.includes('DTEK')).length, 1);
});

test('Yasno as Active Source without tomorrow does not cause a second Publication later', async () => {
  const w = world();
  w.set('dtek', k('2026-10-17', '20:00'), { '2026-10-17': { '3.2': day('') }, '2026-10-18': { '3.2': day('XX') } });
  await w.app.tick(k('2026-10-17', '20:05'));
  await w.app.subscribe(1, '3.2', k('2026-10-17', '20:06'));
  w.set('dtek', 0, new Error('down'));
  w.set('yasno', k('2026-10-17', '20:30'), { '2026-10-17': { '3.2': day('') } });
  for (let t = k('2026-10-17', '20:10'); t <= k('2026-10-17', '21:00'); t += 5 * MIN) await w.app.tick(t);
  w.set('dtek', k('2026-10-17', '20:00'), { '2026-10-17': { '3.2': day('') }, '2026-10-18': { '3.2': day('XX') } });
  await w.app.tick(k('2026-10-17', '21:05'));
  assert.deepEqual(w.sent, []);
});

test('a Subscriber with notifications off gets nothing', async () => {
  const w = world();
  w.set('dtek', k('2026-10-17', '10:00'), { '2026-10-17': { '3.2': day('') } });
  await w.app.tick(k('2026-10-17', '10:05'));
  await w.app.subscribe(1, '3.2', k('2026-10-17', '10:06'));
  w.app.setNotify(1, false, k('2026-10-17', '10:07'));
  w.set('dtek', k('2026-10-17', '11:00'), { '2026-10-17': { '3.2': day('.'.repeat(40) + 'XX') } });
  await w.app.tick(k('2026-10-17', '11:05'));
  assert.deepEqual(w.sent, []);
});

test('the Admin prefers Yasno: its change is sent even though DTEK is fresh, and the switch is alerted', async () => {
  const w = world();
  w.set('dtek', k('2026-10-17', '10:00'), { '2026-10-17': { '3.2': day('') } });
  w.set('yasno', k('2026-10-17', '10:00'), { '2026-10-17': { '3.2': day('') } });
  await w.app.tick(k('2026-10-17', '10:05'));
  await w.app.subscribe(1, '3.2', k('2026-10-17', '10:06'));
  w.set('yasno', k('2026-10-17', '10:30'), { '2026-10-17': { '3.2': day('.'.repeat(40) + 'XX') } });
  await w.app.tick(k('2026-10-17', '10:35'));
  assert.equal(w.sent.length, 0);

  w.app.setPreference('yasno');
  await w.app.tick(k('2026-10-17', '10:40'));
  assert.equal(w.app.preference(), 'yasno');
  assert.equal(w.sent.length, 1);
  assert.match(w.sent[0].text, /^<b>Зміна графіка на сьогодні<\/b>/);
  assert.match(w.sent[0].text, /<i>Джерело: Yasno<\/i>$/);
  assert.ok(w.alerts.includes('ℹ️ Графіки тепер беруться з Yasno.'));
});
