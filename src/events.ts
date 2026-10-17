// What happened to one Group's Schedule since the Subscriber was last told about it.

import { kyivDate, slotIndex, type GroupDays, type PowerState } from './schedule.ts';

export type Event =
  | { kind: 'published'; date: string }
  | { kind: 'changed'; date: string; before: PowerState[]; after: PowerState[] }
  | { kind: 'emergency-started'; date: string }
  | { kind: 'emergency-ended'; date: string };

export function detectEvents(told: GroupDays, current: GroupDays, now: number): Event[] {
  const today = kyivDate(now);
  const events: Event[] = [];
  for (const date of Object.keys(current).sort()) {
    if (date < today) continue;
    const before = told[date];
    const after = current[date];
    if (before === undefined) {
      events.push({ kind: after === 'emergency' ? 'emergency-started' : 'published', date });
    } else if (after === 'emergency') {
      if (before !== 'emergency') events.push({ kind: 'emergency-started', date });
    } else if (before === 'emergency') {
      events.push({ kind: 'emergency-ended', date });
    } else {
      // Slots that are already over do not matter to anyone.
      const from = date === today ? slotIndex(now) : 0;
      if (after.some((state, i) => i >= from && state !== before[i])) {
        events.push({ kind: 'changed', date, before, after });
      }
    }
  }
  return events;
}
