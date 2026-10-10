# Publishing Weather

The app is live at **https://analyticalchem.github.io/weather/**. GitHub Pages publishes the `main` branch of `analyticalchem/weather`. The repository is public, which free GitHub Pages requires. That's fine, because the code holds no personal information: places and settings are saved only on the Chromebook.

## Working from more than one computer

GitHub is the shared copy. Before changing anything, get the latest:

```bash
git pull
```

If this computer doesn't have the project yet:

```bash
gh repo clone analyticalchem/weather
```

**Always ask the owner before pushing.**

## Publishing a new version

1. Increase `VERSION` in `js/version.js` (for example, 0.5.0 → 0.6.0). The installed app uses this number to notice the update.
2. If you added a file the app loads, add it to `APP_FILES` in `sw.js`, or the app will break offline.
3. Commit, then (after the owner says yes) push:
   ```bash
   git push
   ```
4. Pages republishes in about a minute. Check with `gh api repos/analyticalchem/weather/pages/builds/latest`, then open the site to confirm it loads.

## How the update reaches the Chromebook

- The installed app fetches fresh files whenever it's online, so the update arrives the next time the app is opened.
- If the app was already open, Settings shows "A newer version is ready" within the hour. Close the app and open it again.
- The version number is on the last line of **Settings**.
- If something looks half-updated right after publishing, wait a few minutes, then close and reopen the app.

## Installing on a Chromebook

1. Open https://analyticalchem.github.io/weather/ in Chrome.
2. Click the **install icon** at the right end of the address bar. Or open the **⋮** menu → **Cast, save, and share** → **Install page as app**. It installs as **Weather**.
3. Right-click the Weather icon on the shelf and choose **Pin**.
4. Maximize the window, or press the full-screen key on the top row, so there's as much room as possible.
5. In Settings, add the person's own town, then remove Chicago if it isn't needed.
