// Temporary entry point until the Telegram bot exists: prints one group's outages.
//
// First run (pass the Imperva captcha by hand): DTEK_HEADFUL=1 node index.js

import { fetchSchedule, outageIntervals } from './src/dtek.js';

const GROUP = '3.2';
const PROFILE_DIR = new URL('./.browser-profile', import.meta.url).pathname;

const { update, days } = await fetchSchedule({
  profileDir: PROFILE_DIR,
  headful: !!process.env.DTEK_HEADFUL,
});

console.log(`Оновлено: ${update}`);
for (const day of days) {
  const intervals = outageIntervals(day.groups[GROUP] ?? []);
  console.log(
    `${day.date} черга ${GROUP}:`,
    intervals.length ? intervals.map((x) => `${x.from}–${x.to}`).join(', ') : 'без відключень',
  );
}
