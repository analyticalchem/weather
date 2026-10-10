// Main screen, read aloud, click-to-hear, places, and the Settings and Color choices screens.
(function () {
  const HOLD_MS = 2000; // how long Settings must be held to open

  // Complete color combinations offered on the Color choices screen.
  const PRESETS = [
    { bg: 'dark', palette: 'none', name: 'White on black' },
    { bg: 'light', palette: 'none', name: 'Black on white' },
    { bg: 'dark', palette: 'cool', name: 'Cool colors on black' },
    { bg: 'light', palette: 'cool', name: 'Cool colors on white' },
    { bg: 'dark', palette: 'aqua', name: 'Cyan on black' },
    { bg: 'dark', palette: 'yellow', name: 'Yellow on black' }
  ];

  const W = window.Weather;
  const VERSION = W.VERSION; // set in js/version.js
  const settings = W.settings;
  const speech = W.speech;
  const words = W.words;
  const $ = id => document.getElementById(id);

  const STALE_MS = 2 * 60 * 60 * 1000;  // an older forecast says how old it is
  const REFRESH_MS = 30 * 60 * 1000;    // quiet refresh while the app is open
  const RETRY_MS = 5 * 60 * 1000;       // after a failed refresh, try again this often
  const REOPEN_MS = 10 * 60 * 1000;     // coming back to the app refreshes anything older than this
  const ALERT_CHECK_MS = 5 * 60 * 1000; // weather warnings are checked this often while the app is open
  const ALERT_STALE_MS = 30 * 60 * 1000; // after this long without a check, the notice says so

  let places = W.places.all();
  let placeIndex = 0; // always opens on the first ("home") place
  let labels = [];
  let currentView = 'main';
  let shown = { fetchedAt: 0, firstDate: null }; // the forecast on screen
  let chartsPlaceId = null; // the place the charts were last drawn for
  let renderLater = false;  // a refresh that arrived while something was being read
  let shownAlerts = '';     // the alerts on screen, so the banner is rebuilt only when they change
  let announceLater = false; // new warnings waiting for the current reading to finish

  // Two sections, rain then temperature, each a 7-day chart with an hour-by-hour graph under it.
  // One chosen day drives both: clicking a day in either chart, or either graph's arrows, changes it
  // everywhere. The two 7-day charts also scroll together.
  const KINDS = ['rain', 'temp'];
  let selectedDay = 0;
  let selectedDate = null; // the chosen day's date, so a quiet refresh keeps the same day chosen
  // The chosen time block is shared too: an hour inside it. Starts at the place's current hour.
  let selectedHour = 0;

  const strips = W.charts.create({
    charts: KINDS.map(kind => ({
      kind,
      track: $(`${kind}-track`),
      rangeButton: $(`${kind}-range`),
      prevButton: $(`${kind}-days-prev`),
      nextButton: $(`${kind}-days-next`)
    })),
    onSelect: i => selectDay(i)
  });

  const graphs = KINDS.map(kind => W.hourly.create({
    kind,
    graph: $(`${kind}-hourly-graph`),
    titleButton: $(`${kind}-hourly-title`),
    dayPill: $(`${kind}-hourly-day`),
    onSelectHour: hour => {
      selectedHour = hour;
      graphs.forEach(g => g.setSelectedHour(hour));
    }
  }));

  const hourlyPrev = KINDS.map(kind => $(`${kind}-hourly-prev`));
  const hourlyNext = KINDS.map(kind => $(`${kind}-hourly-next`));
  hourlyPrev.forEach(b => b.addEventListener('click', () => stepDay(-1)));
  hourlyNext.forEach(b => b.addEventListener('click', () => stepDay(1)));

  function currentDays() {
    const entry = W.forecast.get(currentPlace().id);
    return entry ? entry.forecast.days : [];
  }

  // The time where the place is, in hours (14.5 is 2:30 PM), so "Now" is right in any time zone.
  function placeNow(timezone) {
    const now = new Date();
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone || undefined, hour: 'numeric', minute: 'numeric', hourCycle: 'h23'
      }).formatToParts(now);
      const part = type => Number(parts.find(p => p.type === type).value);
      return part('hour') + part('minute') / 60;
    } catch (e) {
      return now.getHours() + now.getMinutes() / 60;
    }
  }

  // reveal: false for a quiet refresh, so the charts don't scroll by themselves.
  function selectDay(index, reveal = true) {
    const days = currentDays();
    if (!days.length) return;
    selectedDay = Math.min(days.length - 1, Math.max(0, index));
    selectedDate = days[selectedDay].date;
    strips.select(selectedDay, reveal);
    const nowHour = selectedDay === 0 ? placeNow(currentPlace().timezone) : null;
    graphs.forEach(g => g.render(days[selectedDay], labels[selectedDay], nowHour, selectedHour));
    hourlyPrev.forEach(b => b.setAttribute('aria-disabled', String(selectedDay === 0)));
    hourlyNext.forEach(b => b.setAttribute('aria-disabled', String(selectedDay === days.length - 1)));
  }

  function stepDay(dir) {
    const target = selectedDay + dir;
    if (target < 0 || target >= currentDays().length) return;
    speech.stop(); // anything being read belongs to the day being left
    selectDay(target);
  }

  function refreshCharts() {
    strips.refresh();
    graphs.forEach(g => g.refresh());
  }

  // The sentence an item speaks also becomes its screen reader label.
  function readable(el, say) {
    el.dataset.say = say;
    el.setAttribute('aria-label', say);
  }

  // --- Main screen ------------------------------------------------------------------------------

  const currentPlace = () => places[placeIndex];

  // Writing the same text again would make screen readers repeat it.
  function setText(el, text) {
    if (el.textContent !== text) el.textContent = text;
  }

  // The notice says only what the person needs to know: the weather is on its way, the forecast
  // is old, the weather service can't be reached, or warnings can't be checked.
  function forecastNotice(place, entry) {
    const status = W.forecast.status(place.id);
    if (!entry) return status.error ? words.noForecast(status.error) : words.loading(place);
    const age = Date.now() - entry.fetchedAt;
    if (age <= STALE_MS) return '';
    if (status.loading && !status.error) return ''; // a quiet refresh is already on its way
    return words.oldForecast(age, status.error);
  }

  function alertsUnchecked(place) {
    const status = W.alerts.status(place.id);
    return !status.unsupported && !!status.error && Date.now() - status.checked > ALERT_STALE_MS;
  }

  function noticeText(place, entry) {
    return [forecastNotice(place, entry), alertsUnchecked(place) ? words.alertsUnchecked : '']
      .filter(Boolean).join(' ');
  }

  const ALERT_ICON =
    '<svg class="alert-icon" viewBox="0 0 24 24" aria-hidden="true">' +
    '<path d="M12 1.5 23.2 21.5H.8z" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linejoin="round"/>' +
    '<rect x="10.5" y="7.5" width="3" height="8" rx="1.2" style="fill: var(--accent)"/>' +
    '<circle cx="12" cy="18.2" r="1.7" style="fill: var(--accent)"/></svg>';

  // Severe weather alerts: one large, inverted banner each, under the town name. Silent: clicking
  // one reads it (warning, how long it lasts, and what to do), and Read aloud includes them.
  function renderAlerts() {
    const place = currentPlace();
    const list = W.alerts.get(place.id).map(alert => ({ alert, until: words.until(alert.ends, place.timezone) }));
    const key = place.id + JSON.stringify(list.map(x => [x.alert.id, x.until]));
    if (key === shownAlerts) return;
    shownAlerts = key;
    $('alerts').replaceChildren(...list.map(({ alert, until }) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'alert readable';
      b.dataset.alertId = alert.id;
      b.innerHTML = ALERT_ICON;
      const text = document.createElement('span');
      text.className = 'alert-text';
      const event = document.createElement('span');
      event.className = 'alert-event';
      event.textContent = alert.event;
      text.append(event);
      if (until) {
        const ends = document.createElement('span');
        ends.className = 'alert-until';
        ends.textContent = until.charAt(0).toUpperCase() + until.slice(1);
        text.append(ends);
      }
      b.append(text);
      readable(b, words.alertSay(alert, until));
      return b;
    }));
  }

  // "Read new warnings aloud" (off by default): each new warning for the place on screen is read
  // once. It waits for the first click or key press since the app opened, so the app never starts
  // talking by itself at launch; until then the banner just shows, and the next check tries again.
  function announceAlerts() {
    if (!settings.get().readAlerts) return;
    if (speech.isSpeaking()) {
      announceLater = true; // after the current reading finishes
      return;
    }
    if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
    const place = currentPlace();
    const fresh = W.alerts.get(place.id).filter(a => !W.alerts.isAnnounced(place.id, a));
    if (!fresh.length) return;
    const banners = [...$('alerts').children];
    const parts = fresh.map((alert, i) => {
      const until = words.until(alert.ends, place.timezone);
      return {
        text: i === 0 ? words.alertNew(place, alert, until) : words.alertSay(alert, until),
        els: [banners.find(b => b.dataset.alertId === alert.id)]
      };
    });
    if (speech.speak(parts)) W.alerts.markAnnounced(place.id, fresh);
  }

  // A warning that's been heard by clicking it counts as read.
  $('alerts').addEventListener('click', e => {
    const b = e.target.closest('.alert');
    const alert = b && W.alerts.get(currentPlace().id).find(a => a.id === b.dataset.alertId);
    if (alert && settings.get().tapToRead) W.alerts.markAnnounced(currentPlace().id, [alert]);
  });

  function updateNotice() {
    const place = currentPlace();
    const text = noticeText(place, W.forecast.get(place.id));
    const notice = $('notice');
    setText(notice, text);
    if (text) readable(notice, text);
    notice.hidden = !text;
  }

  // keepPosition: new numbers for the place already on screen, so the charts stay where they are.
  function render(keepPosition) {
    const place = currentPlace();
    const entry = W.forecast.get(place.id);
    shown = { fetchedAt: entry ? entry.fetchedAt : 0, firstDate: entry ? entry.forecast.days[0].date : null };

    document.body.classList.toggle('single-place', places.length < 2);
    document.body.classList.toggle('no-forecast', !entry);
    setText($('place-name-text'), place.name);
    setText($('place-count'), places.length > 1 ? `Place ${placeIndex + 1} of ${places.length}` : '');
    readable($('place-name'), words.place(place, placeIndex, places.length));
    renderAlerts();
    updateNotice();
    if (!entry) return;

    const forecast = entry.forecast;
    const today = forecast.days[0];
    labels = words.dayLabels(forecast.days.map(d => d.date));
    setText($('now-temp'), words.temp(forecast.current.temp));
    readable($('now-temp'), words.nowTemp(forecast.current));
    setText($('now-high'), 'High ' + words.temp(today.high));
    setText($('now-low'), 'Low ' + words.temp(today.low));
    readable($('now-hilo'), words.hiLo(today));
    setText($('now-rain-value'), today.rain + '%');
    readable($('now-rain'), words.rainToday(today));

    // Keep the chart position, the chosen day and the chosen time block only if the charts already
    // show this place. A new place starts on today, at its current hour.
    const keep = keepPosition && chartsPlaceId === place.id;
    strips.render(forecast.days, labels, keep);
    if (keep) {
      selectDay(Math.max(0, forecast.days.findIndex(d => d.date === selectedDate)), false);
    } else {
      selectedHour = Math.floor(placeNow(place.timezone));
      selectDay(0);
    }
    chartsPlaceId = place.id;
  }

  function switchPlace(dir) {
    speech.stop();
    placeIndex = (placeIndex + dir + places.length) % places.length;
    render();
    refreshPlaces(REOPEN_MS, false);
    refreshAlerts(ALERT_CHECK_MS, false);
    if (settings.get().sayTown) speech.speak(currentPlace().spokenName + '.', { els: [$('place-name')] });
    announceAlerts(); // waits for the town name, if that's being said
  }

  // --- Keeping the forecast up to date, quietly -----------------------------------------------------

  // Fetches every place whose forecast is older than maxAgeMs. After a failure it waits RETRY_MS
  // before trying again, unless force is set (the app was reopened or the internet came back).
  function refreshPlaces(maxAgeMs, force) {
    const now = Date.now();
    places.forEach(place => {
      const entry = W.forecast.get(place.id);
      const status = W.forecast.status(place.id);
      if (status.loading) return;
      const old = !entry || now - entry.fetchedAt >= maxAgeMs;
      const waited = force || !status.error || now - status.tried >= RETRY_MS;
      if (old && waited) W.forecast.refresh(place);
    });
  }

  // Weather warnings are checked more often than the forecast, with the same rules for retrying.
  function refreshAlerts(maxAgeMs, force) {
    const now = Date.now();
    places.forEach(place => {
      const status = W.alerts.status(place.id);
      if (status.loading || status.unsupported) return;
      const old = now - status.checked >= maxAgeMs;
      const waited = force || !status.error || now - status.tried >= RETRY_MS;
      if (old && waited) W.alerts.refresh(place);
    });
  }

  W.forecast.onChange(placeId => {
    if (placeId !== currentPlace().id) return;
    const entry = W.forecast.get(placeId);
    if ((entry ? entry.fetchedAt : 0) === shown.fetchedAt) {
      updateNotice(); // only the loading or error state changed
    } else if (speech.isSpeaking()) {
      renderLater = true; // don't change what's being read; update when reading stops
    } else {
      render(true);
    }
  });

  W.alerts.onChange(placeId => {
    if (placeId !== currentPlace().id) return;
    updateNotice();
    if (speech.isSpeaking()) {
      renderLater = true;
      announceLater = true;
    } else {
      renderAlerts();
      announceAlerts();
    }
  });

  // Once a minute: refresh anything due, drop warnings that have ended, keep "3 hours ago"
  // current, and move on at midnight.
  function tick() {
    refreshPlaces(REFRESH_MS, false);
    refreshAlerts(ALERT_CHECK_MS, false);
    const entry = W.forecast.get(currentPlace().id);
    const firstDate = entry ? entry.forecast.days[0].date : null;
    if (speech.isSpeaking()) {
      updateNotice();
    } else if (firstDate !== shown.firstDate) {
      render(true);
    } else {
      renderAlerts();
      updateNotice();
      if (entry && selectedDay === 0) graphs.forEach(g => g.setNow(placeNow(currentPlace().timezone)));
    }
    announceAlerts(); // in case Chrome only now allows the app to speak
  }

  // Each part is outlined on screen while it is being read. Warnings come first.
  function summary() {
    const place = currentPlace();
    const entry = W.forecast.get(place.id);
    const notice = $('notice');
    const parts = [{ text: place.spokenName + '.', els: [$('place-name')] }];
    [...$('alerts').children].forEach(b => parts.push({ text: b.dataset.say, els: [b] }));
    if (!notice.hidden) parts.push({ text: notice.dataset.say, els: [notice] });
    if (!entry) return parts;
    const forecast = entry.forecast;
    const today = forecast.days[0];
    parts.push(
      { text: words.nowTemp(forecast.current), els: [$('now-temp')] },
      { text: words.hiLo(today), els: [$('now-hilo')] },
      { text: words.rainToday(today), els: [$('now-rain')] }
    );
    if (settings.get().readAll === 'week') {
      forecast.days.forEach((day, i) => {
        if (i > 0) parts.push({ text: words.dayFull(day, labels[i]), els: strips.dayElements(i) });
      });
    }
    return parts;
  }

  function toggleReadAloud() {
    if (speech.isSpeaking()) {
      speech.stop();
    } else if (speech.speak(summary())) {
      W.alerts.markAnnounced(currentPlace().id, W.alerts.get(currentPlace().id)); // warnings were just read
    } else {
      $('read-btn-text').textContent = 'No voice found';
      setTimeout(() => { if (!speech.isSpeaking()) $('read-btn-text').textContent = 'Read aloud'; }, 3000);
    }
  }

  // Any speech (read aloud or a clicked item) turns the big button into Stop.
  speech.onChange(on => {
    $('read-btn-text').textContent = on ? 'Stop reading' : 'Read aloud';
    // SVG elements have no .hidden property, so toggle the attribute itself.
    document.querySelector('#read-btn .icon-speak').toggleAttribute('hidden', on);
    document.querySelector('#read-btn .icon-stop').toggleAttribute('hidden', !on);
    // Speech also "stops" for a moment when a new item is clicked, so wait a tick to see whether
    // something new started reading before redrawing.
    if (!on && (renderLater || announceLater)) {
      setTimeout(() => {
        if (speech.isSpeaking()) return;
        if (renderLater) {
          renderLater = false;
          render(true);
        }
        if (announceLater) {
          announceLater = false;
          announceAlerts();
        }
      }, 0);
    }
  });

  // --- Click any item to hear it. Clicking the item being read stops it. -------------------------

  document.addEventListener('click', e => {
    const el = e.target.closest('.readable');
    if (!el || !settings.get().tapToRead) return;
    if (speech.isReading(el)) {
      speech.stop();
      return;
    }
    const say = el.dataset.say || el.textContent.trim();
    if (say) speech.speak(say, { els: [el] });
  });

  // --- Settings button: press and hold, so a stray click can't open it -----------------------------

  const holdBtn = $('settings-btn');
  const HOLD_HINT = 'Press and hold';
  let holdTimer = 0;
  let hintTimer = 0;
  holdBtn.style.setProperty('--hold-ms', HOLD_MS + 'ms');

  function setHint(text, resetAfterMs) {
    clearTimeout(hintTimer);
    $('settings-hint').textContent = text;
    if (resetAfterMs) hintTimer = setTimeout(() => { $('settings-hint').textContent = HOLD_HINT; }, resetAfterMs);
  }

  holdBtn.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    e.preventDefault();
    try { holdBtn.setPointerCapture(e.pointerId); } catch (err) { /* pointer already gone */ }
    holdBtn.classList.add('holding');
    setHint('Keep holding…');
    holdTimer = setTimeout(() => {
      holdTimer = 0;
      holdBtn.classList.remove('holding');
      setHint(HOLD_HINT);
      showView('settings');
    }, HOLD_MS);
  });

  function cancelHold() {
    if (!holdTimer) return;
    clearTimeout(holdTimer);
    holdTimer = 0;
    holdBtn.classList.remove('holding');
    setHint('Hold longer to open', 2500);
  }
  holdBtn.addEventListener('pointerup', cancelHold);
  holdBtn.addEventListener('pointercancel', cancelHold);
  holdBtn.addEventListener('lostpointercapture', cancelHold);
  holdBtn.addEventListener('contextmenu', e => e.preventDefault());
  // Keyboard and screen readers activate with detail 0; accidental mouse and touch clicks never do.
  holdBtn.addEventListener('click', e => { if (e.detail === 0) showView('settings'); });

  // --- Screens ------------------------------------------------------------------------------------

  const views = { main: $('view-main'), settings: $('view-settings'), colors: $('view-colors') };

  // Many people double-click everything. Without this, the second click of a double-click lands on
  // whatever the new screen has in that spot (for example, a color choice).
  const SCREEN_CHANGE_GUARD_MS = 500;
  let ignoreClicksUntil = 0;
  document.addEventListener('click', e => {
    if (performance.now() < ignoreClicksUntil) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);

  // Also used when part of a screen changes under the pointer (the place search opening, results appearing).
  function guardClicks() {
    ignoreClicksUntil = performance.now() + SCREEN_CHANGE_GUARD_MS;
  }

  function showView(name) {
    guardClicks();
    speech.stop();
    const from = currentView;
    Object.keys(views).forEach(key => { views[key].hidden = key !== name; });
    currentView = name;
    window.scrollTo(0, 0);
    if (name === 'main') {
      refreshCharts();
      $('place-name').focus({ preventScroll: true });
    } else if (name === 'settings') {
      if (from === 'main') {
        resetPlaces();
        checkForUpdate();
      }
      renderSettings();
      $('settings-title').focus({ preventScroll: true });
    } else {
      renderSwatches();
      $('colors-title').focus({ preventScroll: true });
    }
  }

  document.addEventListener('click', e => {
    const go = e.target.closest('[data-go]');
    if (go) showView(go.dataset.go);
  });

  // --- Settings screen ------------------------------------------------------------------------------

  const onOff = value => (value ? 'on' : 'off');

  function aboutSetting(key, s) {
    switch (key) {
      case 'size': return `Text size. Currently size ${s.size + 1} of ${settings.SIZE_STEPS.length}.`;
      case 'bg': return `Background. Currently ${s.bg}.`;
      case 'color': return `Color. Currently ${onOff(s.color)}.`;
      case 'colors': return 'Color choices. Compare six high-contrast color combinations.';
      case 'rate': return `Reading speed. Currently ${settings.RATE_STEPS[s.rate].label.toLowerCase()}.`;
      case 'readAll': return `The read aloud button reads ${s.readAll === 'week' ? 'the whole week' : 'today only'}.`;
      case 'tapToRead': return `Read items when clicked. Currently ${onOff(s.tapToRead)}.`;
      case 'sayTown': return `Say the town name when switching places. Currently ${onOff(s.sayTown)}.`;
      case 'places': return `Places. ${places.map(p => p.spokenName).join('. ')}.`;
      case 'alerts': return 'Weather warnings. ' + $('alerts-note').textContent;
      case 'readAlerts': return `Read new warnings aloud. Currently ${onOff(s.readAlerts)}.`;
      default: return '';
    }
  }

  const parseValue = v => (v === 'true' ? true : v === 'false' ? false : v);

  function renderSettings() {
    const s = settings.get();
    $('size-value').textContent = `Size ${s.size + 1} of ${settings.SIZE_STEPS.length}`;
    $('rate-value').textContent = settings.RATE_STEPS[s.rate].label;
    document.querySelectorAll('.choice[data-setting]').forEach(b => {
      b.setAttribute('aria-pressed', String(s[b.dataset.setting] === parseValue(b.dataset.value)));
    });
    document.querySelectorAll('[data-about]').forEach(b => readable(b, aboutSetting(b.dataset.about, s)));
    renderPlaces();
    $('version').textContent = `Weather ${VERSION}`;
    showUpdateNote();
  }

  document.addEventListener('click', e => {
    const choice = e.target.closest('.choice[data-setting]');
    if (choice) settings.set(choice.dataset.setting, parseValue(choice.dataset.value));
  });

  $('size-down').addEventListener('click', () => settings.set('size', Math.max(0, settings.get().size - 1)));
  $('size-up').addEventListener('click', () =>
    settings.set('size', Math.min(settings.SIZE_STEPS.length - 1, settings.get().size + 1)));
  $('rate-down').addEventListener('click', () => settings.set('rate', Math.max(0, settings.get().rate - 1)));
  $('rate-up').addEventListener('click', () =>
    settings.set('rate', Math.min(settings.RATE_STEPS.length - 1, settings.get().rate + 1)));
  $('rate-test').addEventListener('click', () => {
    speech.speak(`This is the ${settings.RATE_STEPS[settings.get().rate].label.toLowerCase()} reading speed.`,
      { els: [$('rate-test')] });
  });

  // Reset asks for a second press so it can't happen by accident.
  let resetArmed = 0;
  function disarmReset() {
    clearTimeout(resetArmed);
    resetArmed = 0;
    $('reset-btn').textContent = 'Reset all settings';
  }
  $('reset-btn').addEventListener('click', () => {
    if (!resetArmed) {
      $('reset-btn').textContent = 'Press again to reset';
      resetArmed = setTimeout(disarmReset, 4000);
      return;
    }
    disarmReset();
    settings.reset();
  });

  // --- Settings: places ----------------------------------------------------------------------------

  let changing = null;        // id of the place being changed, or null when adding a place
  let searchOpener = null;    // the button that opened the search, for returning focus
  let searchRun = 0;          // a newer search makes the results of an older one stale
  let results = [];
  const removeArm = { id: null, timer: 0 };

  // Confirmations show under the list, and are also read out when click-to-hear is on.
  function placeMessage(text) {
    $('place-status').textContent = text;
    if (text && settings.get().tapToRead) speech.speak(text);
  }

  function placeButton(label, action, place, disabled) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'action-btn';
    b.textContent = label;
    b.dataset.placeAction = action;
    b.dataset.placeId = place.id;
    b.setAttribute('aria-label', `${label}, ${place.name}`);
    if (disabled) b.setAttribute('aria-disabled', 'true');
    return b;
  }

  function renderPlaces() {
    $('places-list').replaceChildren(...places.map((p, i) => {
      const li = document.createElement('li');
      li.className = 'place-row';
      const name = document.createElement('button');
      name.type = 'button';
      name.className = 'place-row-name readable';
      name.textContent = `${i + 1}. ${p.name}`;
      readable(name, `${i + 1}. ${p.spokenName}.`);
      const actions = document.createElement('div');
      actions.className = 'place-actions';
      actions.append(
        placeButton('Move up', 'up', p, i === 0),
        placeButton('Move down', 'down', p, i === places.length - 1),
        placeButton('Change', 'change', p, false),
        placeButton(removeArm.id === p.id ? 'Press again to remove' : 'Remove', 'remove', p, places.length < 2));
      li.append(name, actions);
      return li;
    }));
  }

  function focusPlaceButton(id, action) {
    const b = $('places-list').querySelector(
      `[data-place-id="${CSS.escape(id)}"][data-place-action="${action}"]`);
    if (b) b.focus();
  }

  // Remove asks for a second press, like Reset, so a place can't be lost by accident.
  function disarmRemove() {
    clearTimeout(removeArm.timer);
    const id = removeArm.id;
    removeArm.id = null;
    const b = id && $('places-list').querySelector(`[data-place-id="${CSS.escape(id)}"][data-place-action="remove"]`);
    if (b) {
      b.textContent = 'Remove';
      b.setAttribute('aria-label', `Remove, ${W.places.get(id).name}`);
    }
  }

  function armRemove(b, place) {
    disarmRemove();
    removeArm.id = place.id;
    removeArm.timer = setTimeout(disarmRemove, 4000);
    b.textContent = 'Press again to remove';
    b.setAttribute('aria-label', `Press again to remove, ${place.name}`);
  }

  $('places-list').addEventListener('click', e => {
    const b = e.target.closest('[data-place-action]');
    const place = b && W.places.get(b.dataset.placeId);
    if (!place) return;
    const action = b.dataset.placeAction;
    if (action !== 'remove' || removeArm.id !== place.id) disarmRemove();
    if (b.getAttribute('aria-disabled') === 'true') {
      if (action === 'remove') placeMessage(words.lastPlace);
      return;
    }
    if (action === 'up' || action === 'down') {
      W.places.move(place.id, action === 'up' ? -1 : 1);
      focusPlaceButton(place.id, action);
    } else if (action === 'change') {
      openSearch(place, b);
    } else if (removeArm.id !== place.id) {
      armRemove(b, place);
    } else {
      disarmRemove();
      closeSearch(false);
      W.places.remove(place.id);
      $('add-place').focus();
      placeMessage(words.placeRemoved(place));
    }
  });

  // --- Place search: type a town or ZIP code, then click the right match ---

  function searchMessage(text) {
    $('search-msg').textContent = text;
  }

  function openSearch(place, opener) {
    guardClicks();
    changing = place ? place.id : null;
    searchOpener = opener;
    searchRun++;
    results = [];
    $('search-title').textContent = place ? `Change ${place.name}` : 'Add a place';
    $('place-query').value = '';
    searchMessage('');
    $('search-results').replaceChildren();
    $('place-status').textContent = '';
    $('place-search').hidden = false;
    $('add-place').hidden = true;
    // Show the whole search box, title included, below the sticky Settings bar.
    $('place-search').scrollIntoView({ block: 'start' });
    $('place-query').focus({ preventScroll: true });
  }

  // returnFocus: put focus back on the button that opened the search (or Add a place).
  function closeSearch(returnFocus) {
    if ($('place-search').hidden) return;
    searchRun++;
    changing = null;
    $('place-search').hidden = true;
    $('add-place').hidden = false;
    if (returnFocus) (searchOpener && searchOpener.isConnected ? searchOpener : $('add-place')).focus();
    searchOpener = null;
  }

  // Back to a closed search and no messages, each time Settings opens.
  function resetPlaces() {
    closeSearch(false);
    disarmRemove();
    $('place-status').textContent = '';
  }

  $('add-place').addEventListener('click', () => openSearch(null, $('add-place')));
  $('search-cancel').addEventListener('click', () => closeSearch(true));

  $('place-search').addEventListener('submit', async e => {
    e.preventDefault();
    const query = $('place-query').value.trim();
    const run = ++searchRun;
    results = [];
    $('search-results').replaceChildren();
    if (query.replace(/[\s,]/g, '').length < 2) {
      searchMessage(words.searchShort);
      return;
    }
    searchMessage(words.searching);
    try {
      const found = await W.places.search(query);
      if (run !== searchRun) return;
      if (!found.length) {
        searchMessage(words.searchNone(query));
        return;
      }
      results = found;
      guardClicks();
      $('search-results').replaceChildren(...found.map((r, i) => {
        const li = document.createElement('li');
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'result-btn';
        b.dataset.result = i;
        b.textContent = r.label;
        li.append(b);
        return li;
      }));
      searchMessage(words.searchFound(found.length));
    } catch (err) {
      if (run === searchRun) searchMessage(words.searchFailed(err.message));
    }
  });

  $('search-results').addEventListener('click', e => {
    const b = e.target.closest('[data-result]');
    const choice = b && results[b.dataset.result];
    if (!choice) return;
    const place = choice.place;
    const old = changing && W.places.get(changing);
    if (old && old.id === place.id) { // picked the same town again: nothing to change
      closeSearch(true);
      return;
    }
    if (W.places.get(place.id)) {
      searchMessage(words.placeAlready(place));
      return;
    }
    if (old) W.places.replace(old.id, place);
    else W.places.add(place);
    closeSearch(false);
    $('add-place').focus();
    placeMessage(old ? words.placeChanged(old, place) : words.placeAdded(place));
  });

  // A change in Settings: the main screen stays on the same place if it's still there.
  W.places.onChange(list => {
    const id = currentPlace().id;
    places = list;
    const i = places.findIndex(p => p.id === id);
    placeIndex = i !== -1 ? i : Math.min(placeIndex, places.length - 1);
    W.forecast.keepOnly(places.map(p => p.id));
    W.alerts.keepOnly(places.map(p => p.id));
    refreshPlaces(REFRESH_MS, true); // a new place gets its forecast and warnings right away
    refreshAlerts(ALERT_CHECK_MS, true);
    render();
    if (currentView === 'settings') renderSettings();
  });

  let readAlertsWas = settings.get().readAlerts;
  settings.onChange(s => {
    if (s.readAlerts && !readAlertsWas) announceAlerts(); // turning it on reads any warnings not yet heard
    readAlertsWas = s.readAlerts;
    if (currentView === 'settings') renderSettings();
    if (currentView === 'colors') renderSwatches();
    refreshCharts();
  });

  // --- Color choices screen -------------------------------------------------------------------------

  function presetIsActive(p, s) {
    return p.bg === s.bg && p.palette === (s.color ? s.palette : 'none');
  }

  function buildSwatches() {
    $('swatches').replaceChildren(...PRESETS.map((p, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'swatch';
      b.dataset.bg = p.bg;
      b.dataset.palette = p.palette;
      b.dataset.preset = i;
      b.setAttribute('aria-label', `${i + 1}. ${p.name}`);
      b.innerHTML = `
        <span class="sw-sample" aria-hidden="true">
          <span class="sw-num">72&deg;</span>
          <span class="sw-temp"></span>
          <span class="sw-rain"></span>
        </span>
        <span class="sw-name" aria-hidden="true">${i + 1}. ${p.name}</span>
        <span class="sw-chosen" aria-hidden="true">✓ Chosen</span>`;
      return b;
    }));
  }

  function renderSwatches() {
    const s = settings.get();
    document.querySelectorAll('.swatch').forEach(b => {
      b.setAttribute('aria-pressed', String(presetIsActive(PRESETS[b.dataset.preset], s)));
    });
  }

  $('swatches').addEventListener('click', e => {
    const b = e.target.closest('.swatch');
    if (!b) return;
    const p = PRESETS[b.dataset.preset];
    const changes = { bg: p.bg, color: p.palette !== 'none' };
    if (p.palette !== 'none') changes.palette = p.palette;
    settings.setMany(changes);
    if (settings.get().tapToRead) speech.speak(`${Number(b.dataset.preset) + 1}. ${p.name}.`, { els: [b] });
  });

  // --- Keyboard: Escape stops reading (or goes back); Space reads aloud on the main screen ------------

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (speech.isSpeaking()) speech.stop();
      else if (currentView === 'settings' && !$('place-search').hidden) closeSearch(true);
      else if (currentView === 'colors') showView('settings');
      else if (currentView === 'settings') showView('main');
    } else if (e.key === ' ' && currentView === 'main' && (e.target === document.body || e.target === document.documentElement)) {
      e.preventDefault();
      toggleReadAloud();
    }
  });

  // --- Offline copy and updates ---------------------------------------------------------------------
  // sw.js keeps a copy of the app so it opens without internet. A release reaches the app the next
  // time it's opened. If one is published while the app is open, Settings says so.

  const UPDATE_CHECK_MS = 60 * 60 * 1000;
  const onWebsite = /^https?:$/.test(location.protocol); // not when opened straight from a file
  let registration = null;
  let newerVersion = null;

  function showUpdateNote() {
    const note = $('update-note');
    setText(note, newerVersion ? words.updateReady(newerVersion) : '');
    note.hidden = !newerVersion;
  }

  // Asks the website which version is published. ?check= tells sw.js not to answer from its copy.
  async function checkForUpdate() {
    if (!onWebsite) return;
    try {
      const res = await fetch('js/version.js?check=' + Date.now(), { cache: 'no-store' });
      const match = res.ok && (await res.text()).match(/VERSION\s*=\s*'([^']+)'/);
      if (match && match[1] !== VERSION) {
        newerVersion = match[1];
        showUpdateNote();
      }
    } catch (e) { /* offline: check again later */ }
    if (registration) registration.update().catch(() => {});
  }

  if ('serviceWorker' in navigator && onWebsite) {
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
      .then(reg => { registration = reg; })
      .catch(() => { /* no offline copy in this browser; the app still works online */ });
  }

  // --- Start ----------------------------------------------------------------------------------------

  $('place-prev').addEventListener('click', () => switchPlace(-1));
  $('place-next').addEventListener('click', () => switchPlace(1));
  $('read-btn').addEventListener('click', toggleReadAloud);

  buildSwatches();
  render();

  // Fresh weather every time the app opens, then quietly every 30 minutes. Coming back to the app
  // or getting the internet back also fetches anything that's out of date.
  refreshPlaces(0, true);
  refreshAlerts(0, true);
  setInterval(tick, 60 * 1000);
  setInterval(checkForUpdate, UPDATE_CHECK_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      refreshPlaces(REOPEN_MS, true);
      refreshAlerts(ALERT_CHECK_MS, true);
      updateNotice();
      checkForUpdate();
    }
  });
  window.addEventListener('online', () => {
    refreshPlaces(REOPEN_MS, true);
    refreshAlerts(ALERT_CHECK_MS, true);
  });
})();
