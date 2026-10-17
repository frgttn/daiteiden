// DTEK Dnipro outage schedule (the Primary Source, see docs/adr/0001).
//
// The site has no separate JSON API for the table: the schedule is embedded in the
// page HTML as `DisconSchedule.fact = {...}` and drawn by their JS. The page sits
// behind Imperva (Incapsula), so plain fetch/curl gets a stub page — we use a real
// browser with a persistent profile so the anti-bot cookies survive between runs.
// If Imperva shows a captcha, the Admin solves it by hand in that browser.

import { chromium } from 'playwright';

import { fromKyiv, kyivDate, type PowerState, type Snapshot } from '../schedule.ts';

const PAGE_URL = 'https://www.dtek-dnem.com.ua/ua/shutdowns';

// Hour statuses from DisconSchedule.preset.time_type → the two half-hour Slots of that hour.
const HALVES: Record<string, [PowerState, PowerState]> = {
  yes: ['on', 'on'], // Світло є
  no: ['off', 'off'], // Світла немає
  first: ['off', 'on'], // Світла не буде перші 30 хв.
  second: ['on', 'off'], // Світла не буде другі 30 хв
  maybe: ['possible', 'possible'], // Можливо відключення
  mfirst: ['possible', 'on'], // Світла можливо не буде перші 30 хв.
  msecond: ['on', 'possible'], // Світла можливо не буде другі 30 хв
};

export type DtekFact = {
  /** "17.10.2026 10:41", Kyiv time. */
  update: string;
  /** "<unix ts of Kyiv midnight>" → "GPV3.2" → "1".."24" → status. */
  data: Record<string, Record<string, Record<string, string>>>;
};

/** Loads the page in a browser and returns the raw `DisconSchedule.fact`. */
export async function fetchDtekFact({ profileDir, headful = false, timeout = headful ? 180_000 : 30_000 }: {
  profileDir: string; headful?: boolean; timeout?: number;
}): Promise<DtekFact> {
  const ctx = await chromium.launchPersistentContext(profileDir, { headless: !headful, locale: 'uk-UA' });
  try {
    const page = ctx.pages()[0] ?? (await ctx.newPage());
    await page.goto(PAGE_URL, { waitUntil: 'domcontentloaded' });
    // DisconSchedule is a top-level `let`, not a window property — reference it bare.
    await page.waitForFunction(
      // @ts-expect-error page global
      () => typeof DisconSchedule !== 'undefined' && DisconSchedule.fact?.data,
      null,
      { timeout },
    );
    // @ts-expect-error page global
    return await page.evaluate(() => DisconSchedule.fact);
  } finally {
    await ctx.close();
  }
}

export function parseDtek(fact: DtekFact): Snapshot {
  const days: Snapshot['days'] = {};
  for (const [ts, groups] of Object.entries(fact.data)) {
    const date = kyivDate(Number(ts) * 1000);
    days[date] = {};
    for (const [key, hours] of Object.entries(groups)) {
      days[date][key.replace(/^GPV/, '')] = Array.from({ length: 24 }, (_, i) => {
        const status = hours[String(i + 1)];
        if (!HALVES[status]) throw new Error(`DTEK: unknown status "${status}" for ${key} on ${date}`);
        return HALVES[status];
      }).flat();
    }
  }
  const [day, month, year, hour, minute] = fact.update.split(/[. :]/).map(Number);
  return { source: 'dtek', updatedAt: fromKyiv(year, month, day, hour, minute), days };
}
