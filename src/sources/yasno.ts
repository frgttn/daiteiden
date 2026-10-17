// YASNO public API (the Fallback Source, see docs/adr/0001): minute ranges per Group.

import { kyivDate, SLOTS_PER_DAY, type GroupDay, type PowerState, type Snapshot } from '../schedule.ts';

export const YASNO_API_URL =
  'https://app.yasno.ua/api/blackout-service/public/shutdowns/regions/3/dsos/301/planned-outages';

type YasnoDay = { date: string; status: string; slots: { start: number; end: number; type: string }[] };
export type YasnoResponse = Record<string, { today: YasnoDay; tomorrow: YasnoDay; updatedOn: string }>;

const TYPES: Record<string, PowerState> = { NotPlanned: 'on', Definite: 'off' };
const RANK: Record<PowerState, number> = { on: 0, possible: 1, off: 2 };

export async function fetchYasno(timeoutMs = 10_000): Promise<YasnoResponse> {
  const response = await fetch(YASNO_API_URL, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`Yasno: HTTP ${response.status}`);
  return (await response.json()) as YasnoResponse;
}

export function parseYasno(response: YasnoResponse): Snapshot {
  const days: Snapshot['days'] = {};
  let updatedAt = 0;
  for (const [group, item] of Object.entries(response)) {
    updatedAt = Math.max(updatedAt, Date.parse(item.updatedOn));
    for (const day of [item.today, item.tomorrow]) {
      const parsed = parseDay(group, day);
      if (parsed === null) continue;
      (days[kyivDate(Date.parse(day.date))] ??= {})[group] = parsed;
    }
  }
  return { source: 'yasno', updatedAt, days };
}

/** null = this day is not published yet. */
function parseDay(group: string, day: YasnoDay): GroupDay | null {
  switch (day.status) {
    case 'WaitingForSchedule': return null;
    case 'EmergencyShutdowns': return 'emergency';
    case 'NoOutages': return Array(SLOTS_PER_DAY).fill('on');
    case 'ScheduleApplies': break;
    default: throw new Error(`Yasno: unknown day status "${day.status}" for ${group}`);
  }
  const slots: PowerState[] = Array(SLOTS_PER_DAY).fill('on');
  for (const range of day.slots) {
    const state = TYPES[range.type];
    if (!state) throw new Error(`Yasno: unknown slot type "${range.type}" for ${group}`);
    // A Slot takes the worst state of any range that touches it.
    for (let i = Math.floor(range.start / 30); i < Math.ceil(range.end / 30); i++) {
      if (RANK[state] > RANK[slots[i]]) slots[i] = state;
    }
  }
  return slots;
}
