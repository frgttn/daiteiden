# DTEK website is the primary source, Yasno API is the fallback

See also [ADR 0002](0002-admin-chooses-preferred-source.md): the Admin can now make Yasno the Preferred Source.

The earlier bot used only Yasno's public JSON API. Yasno publishes changes later than DTEK and sometimes skips night changes completely, for example a schedule changed at 02:00 that decides how people plan their morning. So we scrape DTEK's shutdowns page as the primary Source. It sits behind Imperva and has no JSON API, so it needs a real browser (headless Playwright) with a persistent profile to pass Imperva's JS check. Yasno is kept as the Fallback Source so the bot keeps working while DTEK is blocked.

## Consequences

- A headless Chromium has to run on the server, and blocks need a way to alert the admin.
- The two Sources use different formats (DTEK: hourly with half-hour statuses and "maybe"; Yasno: minute ranges). Both are normalised to Slots.
- DTEK counts as fresh while its last successful fetch is under 30 minutes old; otherwise Yasno becomes the Active Source and the Admin is alerted.
- We first planned a noVNC view of the server's browser so the Admin could solve a captcha by hand. We dropped it: plain HTTP to dtek-dnem only gets an Imperva stub, but headless Chromium has passed the JS check every time, including with a fresh profile in Docker, and no human check has appeared. If one ever does, the bot simply stays on Yasno until DTEK answers again. (ha-dtek-monitor gets by with plain HTTP, but it targets dtek-oem in Odesa, which is not behind the same check.)
