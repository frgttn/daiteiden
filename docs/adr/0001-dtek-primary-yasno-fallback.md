# DTEK website is the primary source, Yasno API is the fallback

The earlier bot used only Yasno's public JSON API. Yasno publishes changes later than DTEK and sometimes skips night changes completely, for example a schedule changed at 02:00 that decides how people plan their morning. So we scrape DTEK's shutdowns page as the primary Source. It sits behind Imperva and has no JSON API, so it needs a real browser (Playwright) with a persistent profile, and from time to time a captcha solved by hand. Yasno is kept as the Fallback Source so the bot keeps working while DTEK is blocked.

## Consequences

- A headless Chromium has to run on the server, and blocks need a way to alert the admin.
- The two Sources use different formats (DTEK: hourly with half-hour statuses and "maybe"; Yasno: minute ranges). Both are normalised to Slots.
- DTEK counts as fresh while its last successful fetch is under 30 minutes old; otherwise Yasno becomes the Active Source and the Admin is alerted. Captchas are solved by the Admin by hand through a noVNC view of the server's browser.
