// SQLite persistence: Drizzle over node:sqlite, migrations from ./drizzle applied on open.

import { count, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-sqlite';
import { migrate } from 'drizzle-orm/node-sqlite/migrator';

import type { SourceState } from './active-source.ts';
import { meta, source, subscriber } from './db/schema.ts';
import type { GroupDays, Snapshot, SourceName } from './schedule.ts';

const MIGRATIONS = new URL('../drizzle', import.meta.url).pathname;

export type Subscriber = Omit<typeof subscriber.$inferSelect, 'createdAt'>;

export function openStore(path: string) {
  const db = drizzle(path);
  db.$client.exec('PRAGMA journal_mode = WAL');
  migrate(db, { migrationsFolder: MIGRATIONS });

  const toSubscriber = ({ createdAt: _, ...row }: typeof subscriber.$inferSelect): Subscriber => row;

  return {
    subscribers(): Subscriber[] {
      return db.select().from(subscriber).all().map(toSubscriber);
    },
    subscriber(chatId: number): Subscriber | undefined {
      const row = db.select().from(subscriber).where(eq(subscriber.chatId, chatId)).get();
      return row && toSubscriber(row);
    },
    upsertSubscriber(chatId: number, group: string, told: GroupDays, now: number) {
      db.insert(subscriber)
        .values({ chatId, group, told, createdAt: now })
        .onConflictDoUpdate({ target: subscriber.chatId, set: { group, told } })
        .run();
    },
    setNotify(chatId: number, notify: boolean, told: GroupDays) {
      db.update(subscriber).set({ notify, told }).where(eq(subscriber.chatId, chatId)).run();
    },
    setPossible(chatId: number, possible: boolean) {
      db.update(subscriber).set({ possible }).where(eq(subscriber.chatId, chatId)).run();
    },
    setTold(chatId: number, told: GroupDays) {
      db.update(subscriber).set({ told }).where(eq(subscriber.chatId, chatId)).run();
    },
    removeSubscriber(chatId: number) {
      db.delete(subscriber).where(eq(subscriber.chatId, chatId)).run();
    },
    countSubscribers(): number {
      return db.select({ n: count() }).from(subscriber).get()!.n;
    },

    source(name: SourceName): SourceState & { failing: boolean } {
      const row = db.select().from(source).where(eq(source.name, name)).get();
      return { snapshot: row?.snapshot ?? undefined, lastOkAt: row?.lastOkAt ?? undefined, failing: !!row?.failing };
    },
    sourceOk(name: SourceName, snapshot: Snapshot, now: number) {
      const set = { snapshot, lastOkAt: now, failing: false };
      db.insert(source).values({ name, ...set }).onConflictDoUpdate({ target: source.name, set }).run();
    },
    sourceFailed(name: SourceName) {
      db.insert(source).values({ name, failing: true }).onConflictDoUpdate({ target: source.name, set: { failing: true } }).run();
    },

    meta(key: string): string | undefined {
      return db.select().from(meta).where(eq(meta.key, key)).get()?.value;
    },
    setMeta(key: string, value: string) {
      db.insert(meta).values({ key, value }).onConflictDoUpdate({ target: meta.key, set: { value } }).run();
    },

    close() {
      db.$client.close();
    },
  };
}

export type Store = ReturnType<typeof openStore>;
