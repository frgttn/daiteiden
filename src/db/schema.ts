import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import type { GroupDays, Snapshot, SourceName } from '../schedule.ts';

export const subscriber = sqliteTable('subscriber', {
  chatId: integer('chat_id').primaryKey(),
  group: text('grp').notNull(),
  notify: integer('notify', { mode: 'boolean' }).notNull().default(true),
  possible: integer('possible', { mode: 'boolean' }).notNull().default(true),
  /** The Schedule this Subscriber was last told about. */
  told: text('told', { mode: 'json' }).$type<GroupDays>().notNull().default({}),
  createdAt: integer('created_at').notNull(),
});

export const source = sqliteTable('source', {
  name: text('name').$type<SourceName>().primaryKey(),
  snapshot: text('snapshot', { mode: 'json' }).$type<Snapshot>(),
  lastOkAt: integer('last_ok_at'),
  failing: integer('failing', { mode: 'boolean' }).notNull().default(false),
});

export const meta = sqliteTable('meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});
