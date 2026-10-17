// The bot's behaviour without Telegram or a browser: poll Sources, tell Subscribers.

import { chooseSchedule, type Choice } from './active-source.ts';
import { detectEvents } from './events.ts';
import { renderEvent, renderReminder } from './messages.ts';
import { dueReminders, REMINDER_LEAD_MS } from './reminders.ts';
import { kyivDate, type GroupDays, type Snapshot, type SourceName } from './schedule.ts';
import { openStore, type Subscriber } from './store.ts';

/** Thrown by `send` when the Subscriber has blocked the bot. */
export class BlockedError extends Error {}

export type Fetchers = Record<SourceName, () => Promise<Snapshot>>;

export type AppDeps = {
  dbPath: string;
  fetchers: Fetchers;
  send: (chatId: number, text: string) => Promise<void>;
  alertAdmin: (text: string) => Promise<void>;
  /** Appended to the alert when DTEK stops answering, e.g. how to reach noVNC. */
  captchaHint?: string;
};

const SOURCE_TITLE: Record<SourceName, string> = { dtek: 'DTEK', yasno: 'Yasno' };

export function createApp(deps: AppDeps) {
  const store = openStore(deps.dbPath);

  const choice = (now: number) => chooseSchedule({ dtek: store.source('dtek'), yasno: store.source('yasno') }, now);

  const groupDays = (snapshot: Snapshot | undefined, group: string): GroupDays => {
    const out: GroupDays = {};
    for (const [date, groups] of Object.entries(snapshot?.days ?? {})) {
      if (groups[group] !== undefined) out[date] = groups[group];
    }
    return out;
  };

  /** What the Subscriber now knows: keep days the Source dropped (Yasno lags), forget past days. */
  const remember = (told: GroupDays, current: GroupDays, now: number): GroupDays => {
    const today = kyivDate(now);
    return Object.fromEntries(Object.entries({ ...told, ...current }).filter(([date]) => date >= today));
  };

  async function poll(name: SourceName, now: number) {
    const before = store.source(name);
    try {
      store.sourceOk(name, await deps.fetchers[name](), now);
      if (before.failing) await deps.alertAdmin(`✅ ${SOURCE_TITLE[name]} знову відповідає.`);
    } catch (error) {
      store.sourceFailed(name);
      if (!before.failing) {
        const hint = name === 'dtek' && deps.captchaHint ? `\n\n${deps.captchaHint}` : '';
        await deps.alertAdmin(`⚠️ ${SOURCE_TITLE[name]} не відповідає: ${(error as Error).message}${hint}`);
      }
    }
  }

  /** Sends one message; false if the Subscriber is gone. */
  async function deliver(subscriber: Subscriber, text: string) {
    try {
      await deps.send(subscriber.chatId, text);
      return true;
    } catch (error) {
      if (error instanceof BlockedError) {
        store.removeSubscriber(subscriber.chatId);
        return false;
      }
      throw error;
    }
  }

  function sourceNote(chosen: Choice) {
    if (chosen.stale) return '\n\n⚠️ Дані можуть бути застарілими: джерела графіків зараз не відповідають.';
    if (chosen.snapshot.source === 'yasno') return '\n\nℹ️ За даними Yasno, можливі неточності: сайт DTEK зараз недоступний.';
    return '';
  }

  async function notify(subscriber: Subscriber, chosen: Choice, from: number, now: number) {
    const current = groupDays(chosen.snapshot, subscriber.group);
    const note = sourceNote(chosen);
    try {
      for (const event of detectEvents(subscriber.told, current, now)) {
        if (!(await deliver(subscriber, renderEvent(event, current, subscriber.group, now) + note))) return;
      }
      store.setTold(subscriber.chatId, remember(subscriber.told, current, now));
      for (const reminder of dueReminders(current, from, now, { possible: subscriber.possible })) {
        if (!(await deliver(subscriber, renderReminder(reminder) + note))) return;
      }
    } catch (error) {
      console.error(`Failed to notify ${subscriber.chatId}:`, error);
    }
  }

  return {
    async tick(now: number) {
      await Promise.all((['dtek', 'yasno'] as const).map((name) => poll(name, now)));
      const chosen = choice(now);
      if (!chosen) return;

      const active = chosen.snapshot.source;
      if (store.meta('active_source') !== active) {
        if (store.meta('active_source') !== undefined) await deps.alertAdmin(`ℹ️ Графіки тепер беруться з ${SOURCE_TITLE[active]}.`);
        store.setMeta('active_source', active);
      }

      // After downtime, skip Reminders that are no longer useful.
      const lastTick = Number(store.meta('last_tick_at') ?? now);
      const from = Math.max(lastTick, now - REMINDER_LEAD_MS);
      for (const subscriber of store.subscribers()) {
        if (subscriber.notify) await notify(subscriber, chosen, from, now);
      }
      store.setMeta('last_tick_at', String(now));
    },

    /** Chooses (or changes) the Subscriber's Group; they already see its Schedule, so no events for it. */
    subscribe(chatId: number, group: string, now: number) {
      store.upsertSubscriber(chatId, group, groupDays(choice(now)?.snapshot, group), now);
    },

    setNotify(chatId: number, on: boolean, now: number) {
      const subscriber = store.subscriber(chatId);
      if (subscriber) store.setNotify(chatId, on, groupDays(choice(now)?.snapshot, subscriber.group));
    },

    setPossible(chatId: number, on: boolean) {
      store.setPossible(chatId, on);
    },

    subscriber: (chatId: number) => store.subscriber(chatId),

    /** The Active Source's Schedule for a Group, with a note when it is not from fresh DTEK. */
    schedule(group: string, now: number) {
      const chosen = choice(now);
      return chosen ? { days: groupDays(chosen.snapshot, group), note: sourceNote(chosen) } : null;
    },

    adminStatus(now: number) {
      const line = (name: SourceName) => {
        const s = store.source(name);
        const ago = s.lastOkAt === undefined ? 'ніколи' : `${Math.round((now - s.lastOkAt) / 60_000)} хв тому`;
        return `${SOURCE_TITLE[name]}: останній успішний опит ${ago}${s.failing ? ', зараз не відповідає' : ''}`;
      };
      const chosen = choice(now);
      return [
        `Активне джерело: ${chosen ? SOURCE_TITLE[chosen.snapshot.source] + (chosen.stale ? ' (застаріле)' : '') : 'немає'}`,
        line('dtek'),
        line('yasno'),
        `Підписників: ${store.countSubscribers()}`,
      ].join('\n');
    },

    close: () => store.close(),
  };
}

export type App = ReturnType<typeof createApp>;
