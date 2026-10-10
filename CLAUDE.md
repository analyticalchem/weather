# Weather: a ChromeOS weather app for low vision

## Who this is for

A person with macular degeneration (loss of central vision) uses this on a Chromebook with a mouse and an enlarged cursor. Judge every change by one question: **can they read it and operate it?** The app should also work for other low-vision users, including on touchscreens.

## Status

The app is live at https://analyticalchem.github.io/weather/ (repository `analyticalchem/weather`). Work has been done from two computers, and **GitHub is the shared copy**: pull before starting, and never overwrite work you didn't make.
- **0.1.0:** prototype with sample weather (Phase 1).
- **0.4.0:** live weather, places, offline use, and severe weather alerts (Phases 2 and 3), built on the other computer.
- **0.5.0:** hour-by-hour graphs, with rain above temperature, merged on top of 0.4.0.

Next is **Phase 4: testing with the person**. See `PLAN.md` for every decision made so far, what's left, and the test checklist. See `DEPLOY.md` for publishing. Ask the owner before any `git push`.

## Design rules (don't break these)

- **Contrast:** every text, chart and button color pair meets WCAG AAA (7:1 or better). Colors live only in the theme blocks at the top of `css/app.css`. Check the ratio of any new color before adding it.
- **Sizes are in rem only.** The Text size setting scales the `<html>` font size through `--scale`, so anything in px won't grow. Chrome zoom must also keep working.
- **Minimal main screen,** top to bottom:
  1. Town name.
  2. Severe weather alert banners, when there are any.
  3. A notice, only when something needs saying: getting the weather, an old forecast, or no connection.
  4. Current temperature, high/low, today's rain chance and the Read aloud button.
  5. The **Chance of rain** section: a 7-day chart, then the hour-by-hour rain graph.
  6. The **Temperature** section: a 7-day high/low chart, then the hour-by-hour temperature and feels-like graph.
  7. The Settings button.

  Don't add information to the main screen without the owner agreeing.
- **Never rely on color alone.** Chosen options show a ✓, and an arrow that can't go further turns hollow.
- **Never rely on dragging alone.** The 7-day charts also move with the big arrow buttons, a trackpad swipe and the arrow keys. They always come to rest on whole days and always scroll together.
- **One chosen day drives both sections.** Clicking a day in either 7-day chart, or using either hourly graph's arrows, chooses that day for both hour-by-hour graphs, and the charts scroll to keep it in view. The chosen day's name is inverted in both charts and matches the day label on both graphs.
- **Hour-by-hour graphs are split at the baseline.**
  - **Above it,** every hour is its own target. Pointing at a bar or point highlights just that hour; clicking it chooses that hour's block and reads just that hour.
  - **Below it** are time blocks. Only each block's first hour gets numbers, and `js/hourly.js` measures the numbers to pick a block size (2 to 12 hours) where they never overlap. Clicking a block chooses it for both graphs and reads its hours.
  - **Highlights:** the chosen block has a thick line around it, and pointing at any other block draws a thin line around exactly the same box. Hours follow the same pattern: a thin outline when pointed at, and a thick one of the same size while read. Highlights never cross the baseline.
  - **No panels** under the graphs (the owner removed them).
  - **Starting block:** the chosen block starts at the place's current hour (in the place's own time zone) and stays the same when the day changes. Today's graphs show a "Now" line.
- **Temperature and feels-like are told apart by line style** (solid or dashed) and dot style (filled or hollow), not by color. When space is tight, the "Temp" and "Feels like" names move above their rows.
- **Speech only follows a click.**
  - It never speaks when the app opens.
  - It speaks on Read aloud and when an item is clicked (click-to-hear). It can also say the town name after switching places, but that's off by default.
  - The one exception is "Read new warnings aloud" (off by default). It reads each new weather warning once, and only after the first click or key press since the app opened.
  - While anything is speaking, the Read aloud button becomes "Stop reading". Clicking it, clicking the same item again, or pressing Escape stops speech.
- **Everything on the main screen can be clicked to hear it.** Each item is a `.readable` button whose `data-say` sentence comes from `js/words.js`, and that sentence is also its `aria-label`.
- **Quiet refreshes never move anything.** New weather keeps the charts' position, the chosen day and block, and keyboard focus. A refresh that arrives while something is being read waits until reading stops.
- **Settings opens only after a 2-second press and hold.** Keyboard and screen-reader activation opens it directly.
- **No disabled buttons,** because they're low contrast. Use `aria-disabled` with the high-contrast hollow style instead.
- **No motion** except the short chart slide, which is skipped when `prefers-reduced-motion` is on.
- **Double-click protection:** clicks are ignored for 500 ms after the screen changes.
- **Font:** Atkinson Hyperlegible Next, bold or extra-bold, falling back to Verdana. It's hosted with the app in `fonts/` (OFL license), so it works offline.

## Code layout

There's no build step and there are no dependencies. Scripts are classic `<script>` tags rather than ES modules. Each JS file adds one object to `window.Weather`.

| File | What it does |
|---|---|
| `index.html` | All three screens: main, Settings, Color choices |
| `css/app.css` | Themes (at the top), then layout and components |
| `js/version.js` | The version number. Read by Settings and by `sw.js`. |
| `js/settings.js` | Setting defaults, saving to `localStorage`, applying theme and size. Loaded in `<head>` so there's no flash of the wrong theme. |
| `js/words.js` | Every displayed number format and every spoken sentence |
| `js/places.js` | The person's places (saved on the device; Chicago to start) and the Open-Meteo town and ZIP search |
| `js/forecast.js` | Live forecasts from Open-Meteo (current, 7 days, and hourly), saved on the device for offline use |
| `js/alerts.js` | US National Weather Service warnings, checked every 5 minutes while the app is open |
| `js/speech.js` | Read-aloud engine (Web Speech API): speaks one sentence at a time and outlines whatever is being read |
| `js/charts.js` | The two linked 7-day charts (rain and temperature): drawing, the chosen day, dragging, arrow buttons, trackpad, keyboard |
| `js/hourly.js` | The hour-by-hour graph for the chosen day: rain bars, or temperature and feels-like lines; hour targets above the baseline, time blocks below it, click-to-hear |
| `js/app.js` | Main screen, places, refreshing, alerts, Read aloud, click-to-hear, Settings, Color choices, update check |
| `sw.js` | Service worker for offline use. **Every app file must be listed in `APP_FILES`.** |
| `js/data.js` | Test data only; the app doesn't load it |
| `manifest.webmanifest`, `icons/`, `fonts/` | Installed app name "Weather", its icon (design "A", sun and cloud) and the font |

**Data shapes:**
- **place:** `{ id, name, spokenName, latitude, longitude, timezone, country }`, for example `"Chicago, IL"` shown and `"Chicago, Illinois"` spoken.
- **forecast:** `{ current: { temp, condition }, days: [{ date, high, low, rain, hours }] }`, where `days[0]` is today in the place's time zone. There are up to 7 days, in whole °F.
- **hours:** `[{ hour, temp, feels, rain }]`, the day's hours in the place's own time, from Open-Meteo's `temperature_2m`, `apparent_temperature` and `precipitation_probability`. A forecast saved by 0.4.0 has no `hours` until its next refresh; the graph says so.

**Icons:** `icons/icon.svg` (round) and `icons/icon-maskable.svg` (full square, artwork inside the safe zone) are the sources. The PNGs were rendered from them with headless Chrome at 192, 512 and 180 pixels (apple-touch-icon).

## Run it locally

```bash
python3 -m http.server 8123
```

Then open http://localhost:8123. `.claude/launch.json` (not in git) sets this up as "weather" for the Claude desktop preview. On the iMac it points at Homebrew's `/usr/local/bin/python3.14`, because macOS blocks Xcode's `python3` from reading the Desktop folder.

**Testing tip:** after editing files, the browser (and the service worker) can keep running an older copy of a file next to newer copies of the others. Refetch everything before testing:

```js
await Promise.all([...files].map(f => fetch(f, { cache: 'reload' })));
location.reload();
```

## Publish

Follow `DEPLOY.md`. For every release:
- Increase `VERSION` in `js/version.js`. The service worker uses it to tell the installed app there's an update, and the last line of Settings shows it.
- Add any new file to `APP_FILES` in `sw.js`.
