// Domain types shared by every Source. See GLOSSARY.md for the vocabulary.

export const GROUPS = ['1.1', '1.2', '2.1', '2.2', '3.1', '3.2', '4.1', '4.2', '5.1', '5.2', '6.1', '6.2'];
export const SLOTS_PER_DAY = 48;
export const TIME_ZONE = 'Europe/Kyiv';

export type PowerState = 'on' | 'off' | 'possible';

/** 48 Slots of a Schedule, index 0 = 00:00–00:30, or Emergency Mode for that day. */
export type GroupDay = PowerState[] | 'emergency';

export type SourceName = 'dtek' | 'yasno';

export type Snapshot = {
  source: SourceName;
  /** When the Source says it last changed its data, ms since epoch. */
  updatedAt: number;
  /** Kyiv date "YYYY-MM-DD" → Group → its day. Days that are not published yet are absent. */
  days: Record<string, Record<string, GroupDay>>;
};

const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
});

/** Kyiv calendar date of an instant, as "YYYY-MM-DD". */
export function kyivDate(ms: number) {
  return dateFormatter.format(ms);
}

/** The instant of a Kyiv wall-clock time. */
export function fromKyiv(year: number, month: number, day: number, hour = 0, minute = 0) {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  // Kyiv is UTC+2 or UTC+3; correct the guess by the offset at that moment (twice for DST edges).
  let ms = guess;
  for (let i = 0; i < 2; i++) ms = guess - kyivOffset(ms);
  return ms;
}

function kyivOffset(ms: number) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE, hourCycle: 'h23',
    year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric',
  }).formatToParts(ms);
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute')) - Math.floor(ms / 60_000) * 60_000;
}

const clockFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

/** Minutes since Kyiv midnight. */
export function kyivMinutes(ms: number) {
  const [hour, minute] = clockFormatter.format(ms).split(':').map(Number);
  return hour * 60 + minute;
}

/** Index of the Slot that contains this instant, in its Kyiv day. */
export function slotIndex(ms: number) {
  return Math.floor(kyivMinutes(ms) / 30);
}

/** One Group's days: Kyiv date → its day. */
export type GroupDays = Record<string, GroupDay>;

/** A run of Slots with the same Power State; `end` is null when the run reaches unknown time. */
export type Run = { state: PowerState; start: number; end: number | null };

/** Joins consecutive published days into Runs; Emergency Mode and missing days break the timeline. */
export function toRuns(days: GroupDays): Run[] {
  const runs: Run[] = [];
  for (const date of Object.keys(days).sort()) {
    const day = days[date];
    if (day === 'emergency') continue;
    const [y, m, d] = date.split('-').map(Number);
    day.forEach((state, i) => {
      const start = fromKyiv(y, m, d, Math.floor(i / 2), (i % 2) * 30);
      const end = i === day.length - 1 ? fromKyiv(y, m, d + 1) : fromKyiv(y, m, d, Math.floor((i + 1) / 2), ((i + 1) % 2) * 30);
      const last = runs.at(-1);
      if (last && last.end === start && last.state === state) last.end = end;
      else runs.push({ state, start, end });
    });
  }
  // The last run of each stretch of known days ends in unknown time.
  runs.forEach((run, i) => {
    if (runs[i + 1]?.start !== run.end) run.end = null;
  });
  return runs;
}
