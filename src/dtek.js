// DTEK Dnipro outage schedule.
//
// The site has no separate JSON API for the table: the schedule is embedded in the
// page HTML as `DisconSchedule.fact = {...}` and drawn by their JS. The page sits
// behind Imperva (Incapsula), so plain fetch/curl gets a stub page — we use a real
// browser with a persistent profile so the anti-bot cookies survive between runs.
// If Imperva shows a captcha, run once with `headful: true` and pass it by hand.

import { chromium } from 'playwright';

const PAGE_URL = 'https://www.dtek-dnem.com.ua/ua/shutdowns';

// Hour slot statuses, as in DisconSchedule.preset.time_type.
export const STATUS = {
  yes: 'Світло є',
  no: 'Світла немає',
  first: 'Світла не буде перші 30 хв.',
  second: 'Світла не буде другі 30 хв',
  maybe: 'Можливо відключення',
  mfirst: 'Світла можливо не буде перші 30 хв.',
  msecond: 'Світла можливо не буде другі 30 хв',
};

/**
 * @typedef {{ timestamp: number, date: string, groups: Record<string, string[]> }} Day
 * `groups` maps "3.1" → 24 statuses, index 0 = 00:00–01:00.
 * @typedef {{ update: string, days: Day[] }} Schedule
 */

/**
 * Loads the page in a browser and returns the parsed schedule.
 * @param {{ profileDir: string, headful?: boolean, timeout?: number }} options
 * @returns {Promise<Schedule>}
 */
export async function fetchSchedule({ profileDir, headful = false, timeout = headful ? 180_000 : 30_000 }) {
  const ctx = await chromium.launchPersistentContext(profileDir, {
    headless: !headful,
    locale: 'uk-UA',
  });
  try {
    const page = ctx.pages()[0] ?? (await ctx.newPage());
    await page.goto(PAGE_URL, { waitUntil: 'domcontentloaded' });
    // In headful mode this waits while you solve the Imperva check.
    // DisconSchedule is a top-level `let`, not a window property — reference it bare.
    await page.waitForFunction(() => typeof DisconSchedule !== 'undefined' && DisconSchedule.fact?.data, null, {
      timeout,
    });
    const fact = await page.evaluate(() => DisconSchedule.fact);
    return parseFact(fact);
  } finally {
    await ctx.close();
  }
}

/**
 * Parses a raw `DisconSchedule.fact` object (from the page or the /ua/ajax responses).
 * @returns {Schedule}
 */
export function parseFact(fact) {
  // fact.data = { "<unix ts of local midnight>": { "GPV1.1": { "1": "yes", ..., "24": "no" } } }
  // Tomorrow appears as a second key once DTEK publishes it.
  const days = Object.entries(fact.data)
    .map(([ts, groups]) => ({
      timestamp: Number(ts),
      date: new Date(Number(ts) * 1000).toLocaleDateString('uk-UA', { timeZone: 'Europe/Kyiv' }),
      groups: Object.fromEntries(
        Object.entries(groups).map(([g, hours]) => [
          g.replace(/^GPV/, ''),
          Array.from({ length: 24 }, (_, i) => hours[String(i + 1)]),
        ]),
      ),
    }))
    .sort((a, b) => a.timestamp - b.timestamp);
  return { update: fact.update, days };
}

/** Turns 24 hourly statuses into outage intervals like [{from: "17:00", to: "20:30"}]. */
export function outageIntervals(hours) {
  // Expand to 48 half-hour slots: true = no power.
  const off = hours.flatMap((s) => {
    if (s === 'no') return [true, true];
    if (s === 'first') return [true, false];
    if (s === 'second') return [false, true];
    return [false, false];
  });
  const fmt = (slot) =>
    `${String(Math.floor(slot / 2)).padStart(2, '0')}:${slot % 2 ? '30' : '00'}`;
  const out = [];
  for (let i = 0; i < off.length; i++) {
    if (!off[i]) continue;
    let j = i;
    while (j < off.length && off[j]) j++;
    out.push({ from: fmt(i), to: j === 48 ? '24:00' : fmt(j) });
    i = j;
  }
  return out;
}
