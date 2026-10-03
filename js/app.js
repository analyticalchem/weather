// Main screen, read aloud, click-to-hear, places, and the Settings and Color choices screens.
(function () {
  const VERSION = '0.1.0';
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
  const settings = W.settings;
  const speech = W.speech;
  const words = W.words;
  const $ = id => document.getElementById(id);

  const places = W.sampleData.places;
  const forecasts = W.sampleData.forecasts;
  let placeIndex = 0; // always opens on the first ("home") place
  let labels = [];
  let currentView = 'main';

  const charts = W.charts.create({
    tempTrack: $('temp-track'),
    rainTrack: $('rain-track'),
    rangeButtons: [$('temp-range'), $('rain-range')],
    prevButtons: [...document.querySelectorAll('[data-days="-1"]')],
    nextButtons: [...document.querySelectorAll('[data-days="1"]')]
  });

  // The sentence an item speaks also becomes its screen reader label.
  function readable(el, say) {
    el.dataset.say = say;
    el.setAttribute('aria-label', say);
  }

  // --- Main screen ------------------------------------------------------------------------------

  function render() {
    const place = places[placeIndex];
    const forecast = forecasts[place.id];
    const today = forecast.days[0];
    labels = words.dayLabels(forecast.days.length);

    document.body.classList.toggle('single-place', places.length < 2);
    $('place-name-text').textContent = place.name;
    $('place-count').textContent =
      (places.length > 1 ? `Place ${placeIndex + 1} of ${places.length} · ` : '') + 'Sample weather';
    readable($('place-name'), words.place(place, placeIndex, places.length));

    $('now-temp').textContent = words.temp(forecast.current.temp);
    readable($('now-temp'), words.nowTemp(forecast.current));
    $('now-high').textContent = 'High ' + words.temp(today.high);
    $('now-low').textContent = 'Low ' + words.temp(today.low);
    readable($('now-hilo'), words.hiLo(today));
    $('now-rain-value').textContent = today.rain + '%';
    readable($('now-rain'), words.rainToday(today));

    charts.render(forecast.days, labels);
  }

  function switchPlace(dir) {
    speech.stop();
    placeIndex = (placeIndex + dir + places.length) % places.length;
    render();
    if (settings.get().sayTown) speech.speak(places[placeIndex].spokenName + '.', { els: [$('place-name')] });
  }

  // Each part is outlined on screen while it is being read.
  function summary() {
    const place = places[placeIndex];
    const forecast = forecasts[place.id];
    const today = forecast.days[0];
    const parts = [
      { text: place.spokenName + '.', els: [$('place-name')] },
      { text: words.nowTemp(forecast.current), els: [$('now-temp')] },
      { text: words.hiLo(today), els: [$('now-hilo')] },
      { text: words.rainToday(today), els: [$('now-rain')] }
    ];
    if (settings.get().readAll === 'week') {
      forecast.days.forEach((day, i) => {
        if (i > 0) parts.push({ text: words.dayFull(day, labels[i]), els: charts.dayElements(i) });
      });
    }
    return parts;
  }

  function toggleReadAloud() {
    if (speech.isSpeaking()) {
      speech.stop();
    } else if (!speech.speak(summary())) {
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

  function showView(name) {
    ignoreClicksUntil = performance.now() + SCREEN_CHANGE_GUARD_MS;
    speech.stop();
    Object.keys(views).forEach(key => { views[key].hidden = key !== name; });
    currentView = name;
    window.scrollTo(0, 0);
    if (name === 'main') {
      charts.refresh();
      $('place-name').focus({ preventScroll: true });
    } else if (name === 'settings') {
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
    $('places-list').replaceChildren(...places.map(p => {
      const li = document.createElement('li');
      li.textContent = p.name;
      return li;
    }));
    $('version').textContent = `Weather ${VERSION} · Prototype with sample weather`;
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

  settings.onChange(() => {
    if (currentView === 'settings') renderSettings();
    if (currentView === 'colors') renderSwatches();
    charts.refresh();
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
      else if (currentView === 'colors') showView('settings');
      else if (currentView === 'settings') showView('main');
    } else if (e.key === ' ' && currentView === 'main' && (e.target === document.body || e.target === document.documentElement)) {
      e.preventDefault();
      toggleReadAloud();
    }
  });

  // --- Start ----------------------------------------------------------------------------------------

  $('place-prev').addEventListener('click', () => switchPlace(-1));
  $('place-next').addEventListener('click', () => switchPlace(1));
  $('read-btn').addEventListener('click', toggleReadAloud);

  buildSwatches();
  render();
})();
