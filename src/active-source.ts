// Which Source the bot trusts right now (docs/adr/0001, docs/adr/0002).

import type { Snapshot, SourceName } from './schedule.ts';

/** A Source counts as fresh while its last successful fetch is this recent. */
export const FRESH_FOR_MS = 30 * 60_000;

/** The last good Snapshot of a Source and when it was fetched. */
export type SourceState = { snapshot?: Snapshot; lastOkAt?: number };

export type Choice = { snapshot: Snapshot; stale: boolean };

export function chooseSchedule(sources: Record<SourceName, SourceState>, now: number, preferred: SourceName = 'dtek'): Choice | null {
  const main = sources[preferred];
  const other = sources[preferred === 'dtek' ? 'yasno' : 'dtek'];
  const fresh = (s: SourceState) => s.lastOkAt !== undefined && now - s.lastOkAt <= FRESH_FOR_MS;
  const pick = (s: SourceState): Choice => ({ snapshot: s.snapshot!, stale: !fresh(s) });

  if (main.snapshot && fresh(main)) return pick(main);
  // Only trust the other Source when it knows about a change the preferred one did not show us.
  if (other.snapshot && (!main.snapshot || other.snapshot.updatedAt > main.snapshot.updatedAt)) return pick(other);
  if (main.snapshot) return pick(main);
  return null;
}
