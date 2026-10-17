// Reminders 30 minutes before an Outage (or Possible Off) starts or ends.

import { toRuns, type GroupDays } from './schedule.ts';

export const REMINDER_LEAD_MS = 30 * 60_000;

export type Reminder =
  | { kind: 'outage-starts'; at: number; start: number; end: number | null }
  | { kind: 'outage-ends'; at: number; end: number }
  | { kind: 'outage-ends-into-possible'; at: number; end: number; possibleUntil: number | null }
  | { kind: 'possible-starts'; at: number; start: number; end: number | null };

/** Reminders whose time falls in (from, to]. */
export function dueReminders(days: GroupDays, from: number, to: number, options: { possible: boolean }): Reminder[] {
  const runs = toRuns(days);
  const all: Reminder[] = [];
  runs.forEach((run, i) => {
    const prev = runs[i - 1]?.end === run.start ? runs[i - 1] : undefined;
    const next = run.end !== null && runs[i + 1]?.start === run.end ? runs[i + 1] : undefined;
    if (run.state === 'off') {
      all.push({ kind: 'outage-starts', at: run.start - REMINDER_LEAD_MS, start: run.start, end: run.end });
      // A 30-minute Outage would get its end Reminder the moment it starts.
      if (run.end !== null && run.end - REMINDER_LEAD_MS > run.start) {
        const at = run.end - REMINDER_LEAD_MS;
        all.push(next?.state === 'possible'
          ? { kind: 'outage-ends-into-possible', at, end: run.end, possibleUntil: next.end }
          : { kind: 'outage-ends', at, end: run.end });
      }
    } else if (run.state === 'possible' && options.possible && prev?.state !== 'off') {
      all.push({ kind: 'possible-starts', at: run.start - REMINDER_LEAD_MS, start: run.start, end: run.end });
    }
  });
  return all.filter((r) => from < r.at && r.at <= to);
}
