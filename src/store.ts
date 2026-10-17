// SQLite persistence (node:sqlite). Small enough that an ORM would only add weight.

import { DatabaseSync } from 'node:sqlite';

import type { SourceState } from './active-source.ts';
import type { GroupDays, Snapshot, SourceName } from './schedule.ts';

export type Subscriber = {
  chatId: number;
  group: string;
  notify: boolean;
  possible: boolean;
  /** The Schedule this Subscriber was last told about. */
  told: GroupDays;
};

type SubscriberRow = { chat_id: number; grp: string; notify: number; possible: number; told: string };
type SourceRow = { snapshot: string | null; last_ok_at: number | null; failing: number };

export function openStore(path: string) {
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS subscriber (
      chat_id INTEGER PRIMARY KEY,
      grp TEXT NOT NULL,
      notify INTEGER NOT NULL DEFAULT 1,
      possible INTEGER NOT NULL DEFAULT 1,
      told TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS source (
      name TEXT PRIMARY KEY,
      snapshot TEXT,
      last_ok_at INTEGER,
      failing INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `);

  const toSubscriber = (row: SubscriberRow): Subscriber => ({
    chatId: row.chat_id, group: row.grp, notify: !!row.notify, possible: !!row.possible, told: JSON.parse(row.told),
  });

  return {
    subscribers(): Subscriber[] {
      return (db.prepare('SELECT * FROM subscriber').all() as SubscriberRow[]).map(toSubscriber);
    },
    subscriber(chatId: number): Subscriber | undefined {
      const row = db.prepare('SELECT * FROM subscriber WHERE chat_id = ?').get(chatId) as SubscriberRow | undefined;
      return row && toSubscriber(row);
    },
    upsertSubscriber(chatId: number, group: string, told: GroupDays, now: number) {
      db.prepare(`
        INSERT INTO subscriber (chat_id, grp, told, created_at) VALUES (?, ?, ?, ?)
        ON CONFLICT (chat_id) DO UPDATE SET grp = excluded.grp, told = excluded.told
      `).run(chatId, group, JSON.stringify(told), now);
    },
    setNotify(chatId: number, notify: boolean, told: GroupDays) {
      db.prepare('UPDATE subscriber SET notify = ?, told = ? WHERE chat_id = ?').run(notify ? 1 : 0, JSON.stringify(told), chatId);
    },
    setPossible(chatId: number, possible: boolean) {
      db.prepare('UPDATE subscriber SET possible = ? WHERE chat_id = ?').run(possible ? 1 : 0, chatId);
    },
    setTold(chatId: number, told: GroupDays) {
      db.prepare('UPDATE subscriber SET told = ? WHERE chat_id = ?').run(JSON.stringify(told), chatId);
    },
    removeSubscriber(chatId: number) {
      db.prepare('DELETE FROM subscriber WHERE chat_id = ?').run(chatId);
    },
    countSubscribers(): number {
      return (db.prepare('SELECT count(*) AS n FROM subscriber').get() as { n: number }).n;
    },

    source(name: SourceName): SourceState & { failing: boolean } {
      const row = db.prepare('SELECT snapshot, last_ok_at, failing FROM source WHERE name = ?').get(name) as SourceRow | undefined;
      return {
        snapshot: row?.snapshot ? (JSON.parse(row.snapshot) as Snapshot) : undefined,
        lastOkAt: row?.last_ok_at ?? undefined,
        failing: !!row?.failing,
      };
    },
    sourceOk(name: SourceName, snapshot: Snapshot, now: number) {
      db.prepare(`
        INSERT INTO source (name, snapshot, last_ok_at, failing) VALUES (?, ?, ?, 0)
        ON CONFLICT (name) DO UPDATE SET snapshot = excluded.snapshot, last_ok_at = excluded.last_ok_at, failing = 0
      `).run(name, JSON.stringify(snapshot), now);
    },
    sourceFailed(name: SourceName) {
      db.prepare(`
        INSERT INTO source (name, failing) VALUES (?, 1) ON CONFLICT (name) DO UPDATE SET failing = 1
      `).run(name);
    },

    meta(key: string): string | undefined {
      return (db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value: string } | undefined)?.value;
    },
    setMeta(key: string, value: string) {
      db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value').run(key, value);
    },

    close() {
      db.close();
    },
  };
}

export type Store = ReturnType<typeof openStore>;
