// Entry point: wires real Sources, Telegram and the 5-minute polling loop.

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import { createApp } from './app.ts';
import { createBot } from './bot.ts';
import { fetchDtekFact, parseDtek } from './sources/dtek.ts';
import { fetchYasno, parseYasno } from './sources/yasno.ts';

const POLL_EVERY_MS = 5 * 60_000;

const env = (name: string, fallback?: string) => {
  const value = process.env[name] ?? fallback;
  if (value === undefined) throw new Error(`Missing ${name} (see .env.example)`);
  return value;
};

const token = env('TELEGRAM_BOT_TOKEN');
const adminChatId = Number(env('ADMIN_CHAT_ID'));
const dbPath = env('DB_PATH', 'data/daiteiden.db');
const profileDir = env('BROWSER_PROFILE', '.browser-profile');

mkdirSync(dirname(dbPath), { recursive: true });

const fetchers = {
  async dtek() {
    return parseDtek(await fetchDtekFact({ profileDir }));
  },
  async yasno() {
    return parseYasno(await fetchYasno());
  },
};

let telegram: ReturnType<typeof createBot>;
const app = createApp({
  dbPath,
  fetchers,
  send: (chatId, text) => telegram.send(chatId, text),
  alertAdmin: async (text) => {
    await telegram.send(adminChatId, text).catch((error) => console.error('Admin alert failed:', error));
  },
});

telegram = createBot({ token, app, adminChatId });

async function loop() {
  try {
    await app.tick(Date.now());
  } catch (error) {
    console.error('Tick failed:', error);
  }
  setTimeout(loop, POLL_EVERY_MS);
}

await telegram.start();
console.log('Daiteiden is running.');
void loop();

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => {
    await telegram.bot.stop();
    app.close();
    process.exit(0);
  });
}
