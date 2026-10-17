// Which Source the bot trusts right now (docs/adr/0001).

import type { Snapshot, SourceName } from './schedule.ts';

/** A Source counts as fresh while its last successful fetch is this recent. */
export const FRESH_FOR_MS = 30 * 60_000;

/** The last good Snapshot of a Source and when it was fetched. */
export type SourceState = { snapshot?: Snapshot; lastOkAt?: number };

export type Choice = { snapshot: Snapshot; stale: boolean };

export function chooseSchedule(sources: Record<SourceName, SourceState>, now: number): Choice | null {
  const { dtek, yasno } = sources;
  const fresh = (s: SourceState) => s.lastOkAt !== undefined && now - s.lastOkAt <= FRESH_FOR_MS;
  const pick = (s: SourceState): Choice => ({ snapshot: s.snapshot!, stale: !fresh(s) });

  if (dtek.snapshot && fresh(dtek)) return pick(dtek);
  // Yasno lags DTEK: only trust it when it knows about a change DTEK did not show us.
  if (yasno.snapshot && (!dtek.snapshot || yasno.snapshot.updatedAt > dtek.snapshot.updatedAt)) return pick(yasno);
  if (dtek.snapshot) return pick(dtek);
  return null;
}
