// Ukrainian message texts (Telegram HTML).

import type { Event } from './events.ts';
import { dueReminders, REMINDER_LEAD_MS, type Reminder } from './reminders.ts';
import { fromKyiv, kyivDate, TIME_ZONE, toRuns, type GroupDay, type GroupDays, type PowerState } from './schedule.ts';

const clock = new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const dayMonth = new Intl.DateTimeFormat('uk-UA', { timeZone: TIME_ZONE, day: 'numeric', month: 'long' });

const time = (ms: number) => clock.format(ms);

const noon = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  return fromKyiv(y, m, d, 12);
};
const nextDate = (date: string) => kyivDate(noon(date) + 24 * 3_600_000);

function dayLabel(date: string, today: string) {
  const name = dayMonth.format(noon(date));
  if (date === today) return `Сьогодні, ${name}`;
  if (date === nextDate(today)) return `Завтра, ${name}`;
  return name[0].toUpperCase() + name.slice(1);
}

export function formatDuration(ms: number) {
  const minutes = Math.round(ms / 60_000);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return [h ? `${h} год` : '', m ? `${m} хв` : ''].filter(Boolean).join(' ') || '0 хв';
}

/** "17:00–20:30" ranges of one Power State in a day. */
function ranges(slots: PowerState[], state: PowerState) {
  const at = (i: number) => (i === slots.length ? '24:00' : `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`);
  const out: { start: number; text: string }[] = [];
  for (let i = 0; i < slots.length; i++) {
    if (slots[i] !== state) continue;
    let j = i;
    while (j < slots.length && slots[j] === state) j++;
    out.push({ start: i, text: `${at(i)}–${at(j)}` });
    i = j - 1;
  }
  return out;
}

function dayLines(day: GroupDay | undefined): string[] {
  if (day === undefined) return ['Графік ще не опубліковано.'];
  if (day === 'emergency') return ['🚨 Аварійні відключення, графік не діє.'];
  const lines = [
    ...ranges(day, 'off').map((r) => ({ start: r.start, line: `🔴 ${r.text} відключення` })),
    ...ranges(day, 'possible').map((r) => ({ start: r.start, line: `🟡 ${r.text} можливе відключення` })),
  ].sort((a, b) => a.start - b.start);
  return lines.length ? lines.map((l) => l.line) : ['Відключень не заплановано.'];
}

/** Off and Possible Off ranges on one line, for "було → стало". */
function summary(day: PowerState[]) {
  const parts = [
    ...ranges(day, 'off').map((r) => ({ start: r.start, text: r.text })),
    ...ranges(day, 'possible').map((r) => ({ start: r.start, text: `${r.text} (можливе)` })),
  ].sort((a, b) => a.start - b.start);
  return parts.length ? parts.map((p) => p.text).join(', ') : 'відключень немає';
}

export function renderSchedule(days: GroupDays, group: string, now: number) {
  const today = kyivDate(now);
  const tomorrow = nextDate(today);
  return [
    `<b>Черга ${group}</b>`,
    '',
    `<b>${dayLabel(today, today)}</b>`,
    ...dayLines(days[today]),
    '',
    `<b>${dayLabel(tomorrow, today)}</b>`,
    ...dayLines(days[tomorrow]),
  ].join('\n');
}

export function renderEvent(event: Event, days: GroupDays, group: string, now: number) {
  const today = kyivDate(now);
  const which = event.date === today ? 'сьогодні' : event.date === nextDate(today) ? 'завтра' : dayMonth.format(noon(event.date));
  const schedule = renderSchedule(days, group, now);
  switch (event.kind) {
    case 'published':
      return [`📅 <b>Опубліковано графік на ${which}</b>`, '', schedule].join('\n');
    case 'emergency-started':
      return ['🚨 <b>Аварійні відключення</b>', 'Плановий графік не діє. Нагадувань не буде, доки режим не скасують.'].join('\n');
    case 'emergency-ended':
      return ['✅ <b>Аварійні відключення скасовано</b>', 'Графік знову діє.', '', schedule].join('\n');
    case 'changed': {
      // A Reminder that would have been due by now is already missed: warn in the change itself.
      const soon = dueReminders(days, now - REMINDER_LEAD_MS, now, { possible: false })
        .filter((r) => r.kind === 'outage-starts')
        .map((r) => `⚠️ Відключення о ${time(r.start)}, через ${formatDuration(r.start - now)}.`);
      return [
        `<b>Зміна графіка на ${which}</b>`,
        ...soon,
        '',
        `Було: ${summary(event.before)}`,
        `Стало: ${summary(event.after)}`,
        '',
        schedule,
      ].join('\n');
    }
  }
}

export function renderReminder(r: Reminder) {
  switch (r.kind) {
    case 'outage-starts':
      return r.end === null
        ? `🔴 О ${time(r.start)} відключення. Коли повернеться світло, ще невідомо.`
        : `🔴 О ${time(r.start)} відключення, до ${time(r.end)}.`;
    case 'outage-ends':
      return `🟢 О ${time(r.end)} має повернутися світло.`;
    case 'outage-ends-into-possible':
      return `🟡 О ${time(r.end)} відключення закінчується, далі можливе відключення${r.possibleUntil === null ? '' : ` до ${time(r.possibleUntil)}`}.`;
    case 'possible-starts':
      return `🟡 О ${time(r.start)} можливе відключення${r.end === null ? '' : `, до ${time(r.end)}`}.`;
  }
}

export function renderStatus(days: GroupDays, now: number) {
  const today = days[kyivDate(now)];
  if (today === undefined) return 'Графіка на сьогодні немає.';
  if (today === 'emergency') return '🚨 Аварійні відключення, графік не діє.';
  const runs = toRuns(days);
  const i = runs.findIndex((r) => r.start <= now && (r.end === null || now < r.end));
  const run = runs[i];
  if (run.state === 'off') {
    return run.end === null
      ? '🔴 Зараз відключення. Коли повернеться світло, ще невідомо.'
      : `🔴 Зараз відключення. Світло має повернутися о ${time(run.end)}, через ${formatDuration(run.end - now)}.`;
  }
  if (run.state === 'possible') {
    return `🟡 Зараз можливе відключення${run.end === null ? '' : `, до ${time(run.end)}`}.`;
  }
  const next = runs.slice(i + 1).find((r) => r.state === 'off');
  return next
    ? `🟢 Зараз світло має бути. Наступне відключення о ${time(next.start)}, через ${formatDuration(next.start - now)}.`
    : '🟢 Зараз світло має бути. Відключень далі в графіку немає.';
}
