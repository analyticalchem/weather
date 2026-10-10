# Weather: plan and decisions

## Decisions so far (agreed with the owner)

**Who and where**
- It's for one person with macular degeneration, and should also work for other low-vision users later.
- They use a Chromebook (model unknown) with a mouse and an enlarged cursor. The app must also work with a touchscreen.
- They haven't used ChromeVox, the screen magnifier or Select-to-Speak.

**How it's delivered**
- An installable web app (PWA), live at https://analyticalchem.github.io/weather/ (repository `analyticalchem/weather`). Work happens on more than one computer, and GitHub is the shared copy (see DEPLOY.md). The link is shared by email.
- The installed name is "Weather", with a custom shelf icon (design "A": a yellow sun and white cloud on navy).

**Main screen, top to bottom**
1. Town name, large, with "Place 1 of 3" under it and big arrow buttons on each side to switch places.
   - Under it: large severe weather alert banners, when there are any, and a notice only when something needs saying (getting the weather, an old forecast, or no connection).
2. Current temperature (largest), with High and Low stacked beside it, today's rain chance, and the big Read aloud button.
3. **Chance of rain** section (moved above temperature on 2026-10-10):
   - The 7-day chart: one bar per day with the percentage written large. Three days show at a time, seven in total.
   - Under it, an hour-by-hour graph of the selected day: a bar for every hour, with numbered hours underneath.
4. **Temperature** section:
   - The 7-day chart: one bar per day from the low to the high, with both numbers written large.
   - Under it, an hour-by-hour graph of the selected day: a solid line with filled dots for the temperature, and a dashed line with hollow dots for "feels like". Rows of numbers sit underneath.
5. The Settings button, far below everything else. It opens only after a 2-second press and hold.

**Moving through days and places**
- The 7-day charts move by dragging (mouse or touch), with tall arrow buttons on each side, by trackpad swipe, or with the arrow keys.
- One chosen day drives both sections (decided 2026-10-10, after briefly trying independent sections). Clicking a day in either 7-day chart shows that day in both hour-by-hour graphs. The arrows on each side of either hourly graph also step through the days.
- The two 7-day charts scroll together and keep the chosen day in view.
- The chosen day's name is inverted (filled) in both charts and matches the day label on both hourly graphs.
- Today's hourly graphs have a "Now" line.
- Hourly graphs are split into time blocks (decided 2026-10-10). There's a bar or point for every hour, but only each block's first hour is numbered, because 24 big numbers can't fit across a Chromebook screen. Blocks are 3 to 4 hours at the default text size and 6 hours at the largest.
- The baseline splits each hourly graph (decided 2026-10-10):
  - **Above it:** every hour. Pointing at any bar or point highlights just that hour with a thin outline. Clicking it chooses that hour's time block (the thick box moves under it, in both graphs) and reads just that hour, with a thick outline of the same size while it's read.
  - **Below it:** time blocks. The chosen block has a thick line around it. Pointing at another block draws a thin line around exactly the same box. Clicking a block chooses it for both graphs and reads all of its hours, outlining each hour's bar as it's read.
- There are no panels under the hourly graphs; the owner removed both on 2026-10-10.
- The chosen block starts at the current hour and stays the same when you change days, so the same time of day can be compared across days.
- Arrows are solid filled triangles, and turn hollow when there's nothing further in that direction.
- Places switch only with the arrow buttons by the town name, never by swiping. Swiping already moves the charts, so a second swipe gesture would cause accidental switches.
- The app always opens on the first place.

**Speech**
- It never reads aloud automatically.
- The Read aloud button covers today, or the whole week if that's set in Settings. While it reads, each part of the screen is outlined and the button becomes "Stop reading".
- Clicking any piece of information reads just that part. Clicking it again stops. In the hourly graphs, clicking an hour's column reads that hour ("4 PM: 74 degrees, feels like 76"), and clicking the graph title reads a summary ("Coldest 58 degrees at 5 AM. Warmest 74 degrees at 2 PM.").
- Saying the new town name when switching places is off by default. It can be turned on in Settings.

**Colors and text**
- Black and white by default, with a Dark/Light toggle. Dark is the default.
- An optional Color mode uses cool, high-contrast colors: cyan and lavender on black, dark teal and deep violet on white.
- The Color choices screen compares six combinations side by side so the person can pick the easiest to read. Because the owner doesn't know which colors they see best, this is part of testing with the person.
- The in-app text size has 7 steps and the default is step 4. At the largest size, three days still fit on a 1366×768 screen.
- The font is Atkinson Hyperlegible Next, bold.

## Phases

| Phase | What | Status |
|---|---|---|
| 1 | Working prototype with sample weather: the whole front end, the icon and the install manifest | **Done** (0.1.0) |
| 2 | Live weather from Open-Meteo, and adding your own places | **Done** (0.4.0, built on the other computer) |
| 3 | Works offline and installs cleanly: a service worker and a clear update flow | **Done** (0.4.0) |
| — | Severe weather alerts | **Done** (0.4.0) |
| — | Hour-by-hour graphs, and rain moved above temperature | **Done** (0.5.0, built on the iMac and merged on top of 0.4.0) |
| 4 | Testing with the person, then a ChromeVox and contrast check, then polish | **Next** |

### What Phases 2 and 3 built (0.4.0)
- **Forecast:** Open-Meteo (free, no key). It fetches the current temperature and conditions in plain words ("Partly cloudy"), plus the 7-day high, low and rain chance, in °F in the place's own time zone. Since 0.5.0, it also fetches hourly temperature, feels-like and rain chance.
- **Places in Settings:** the list starts with Chicago. You can add, change, reorder and remove places by typing a town name or ZIP code and choosing from large matches. The app opens on the first place.
- **Old forecasts and errors:** the last forecast is kept on the device. If it's more than 2 hours old, a notice says how old ("This forecast is from 3 hours ago"). Errors say what happened in plain words.
- **Refreshing:** quietly on opening, every 30 minutes, when coming back to the app, and when the internet returns, without moving anything on screen.
- **Severe weather alerts:** National Weather Service warnings for US places, shown as large banners under the town name. They're silent: clicking one reads it, and Read aloud includes them. An opt-in setting, "Read new warnings aloud", reads each new warning once. Warnings are checked every 5 minutes while the app is open, but not while it's closed; Settings says so.
- **Offline use:** a service worker keeps the app's files. Online, every file comes fresh first, falling back to the saved copy if the network takes over 4 seconds. The font is hosted with the app.
- **Updates:** Settings checks the published version hourly and says when a newer one is ready ("Close the app and open it again to get it").

### Phase 4: testing and polish
- A session with the person (checklist below).
- A ChromeVox pass, a keyboard-only pass, and a contrast audit of every color pair.

### Ideas not yet built (ask the owner first)
- A "Use my location" button for adding a place (in the original plan; not built in 0.4.0).
- A °F/°C setting and a voice picker, for other users.
- Hiding overnight hours, or showing "the next 12 hours" for today, in the hourly graphs, so more hours get numbers.

## Test checklist (with the person)

Do this at the distance they normally sit from the screen, with the app maximized. Write down what they say.

- [ ] **Text size:** start at size 4. Use Settings → Text size, Larger or Smaller, until High and Low are comfortable to read. Which size?
- [ ] **Colors:** Settings → Compare colors. Which number did they pick? Did any make the numbers blur or glow?
- [ ] **Dark or light:** which background do they prefer? Try both.
- [ ] Can they **find and press Read aloud**, and **stop it** partway through?
- [ ] **Click to hear:** click a day's temperature bar. Did they understand what happened? Is the outline on the item being read visible to them?
- [ ] **Reading speed:** Settings → Slower or Faster, then Test voice. Which speed?
- [ ] **Moving through days:** the arrow buttons, then dragging. Which is easier? Can they tell the hollow (end) arrow from the filled one?
- [ ] **Temperature bars:** do the bars make sense, or would the numbers alone be clearer?
- [ ] **Hour by hour:** click a day in either chart. Do they notice both hourly graphs changing to that day? Can they tell the solid temperature line from the dashed "feels like" line? Are there enough numbered hours at their text size?
- [ ] **Hours and blocks:** can they point at single bars and hear them? Can they choose a block below the baseline and hear its hours? Is the thick box around the chosen block clear?
- [ ] **Two kinds of arrows:** the chart arrows scroll days, and the hourly arrows change the day shown. Is that clear, or confusing?
- [ ] **Places:** switch places with the arrows by the town name. Is the town name big enough? Try turning on "Say the town name when switching places" in Settings. Does hearing it help?
- [ ] **Settings button:** is press-and-hold manageable, without being too easy to trigger by accident?
- [ ] **Warnings:** if there's an active alert (or using a test one), is the banner readable? Do they want "Read new warnings aloud" on?
- [ ] **Adding places:** add their own town in Settings. Is the search easy enough? Should the person do it, or a helper?
- [ ] Anything they squinted at, misread or couldn't find.
