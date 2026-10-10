// User settings: defaults, saving them on this device, and applying them to the page.
// Loaded in <head> so the saved theme and text size are in place before the first paint.
window.Weather = window.Weather || {};

Weather.settings = (function () {
  const KEY = 'weather.settings.v1';

  // Multipliers for the root font size. Every size in the CSS is in rem, so this scales everything.
  const SIZE_STEPS = [0.8, 0.9, 1, 1.15, 1.3, 1.5, 1.75];

  const RATE_STEPS = [
    { rate: 0.6, label: 'Very slow' },
    { rate: 0.8, label: 'Slow' },
    { rate: 1, label: 'Normal' },
    { rate: 1.2, label: 'Fast' },
    { rate: 1.4, label: 'Very fast' }
  ];

  // Color sets used when Color is on. Each has a dark and a light version in css/app.css.
  const PALETTES = ['cool', 'aqua', 'yellow'];

  const DEFAULTS = {
    size: 3,             // index into SIZE_STEPS
    bg: 'dark',          // 'dark' | 'light'
    color: false,        // color on or off
    palette: 'cool',     // which color set "Color: On" uses
    rate: 2,             // index into RATE_STEPS
    readAll: 'today',    // what the Read aloud button covers: 'today' | 'week'
    tapToRead: true,     // click an item to hear it
    sayTown: false,      // say the town name when switching places
    units: 'f',          // temperatures in 'f' (Fahrenheit, the default) or 'c' (Celsius)
    readAlerts: false    // read each new weather warning aloud once, without a click
  };

  const listeners = [];
  let state = load();

  function clampIndex(value, list, fallback) {
    return Number.isInteger(value) && value >= 0 && value < list.length ? value : fallback;
  }

  // Never trust stored values: a bad value must not break the app.
  function validate(s) {
    return {
      size: clampIndex(s.size, SIZE_STEPS, DEFAULTS.size),
      bg: s.bg === 'light' ? 'light' : 'dark',
      color: s.color === true,
      palette: PALETTES.includes(s.palette) ? s.palette : DEFAULTS.palette,
      rate: clampIndex(s.rate, RATE_STEPS, DEFAULTS.rate),
      readAll: s.readAll === 'week' ? 'week' : 'today',
      tapToRead: s.tapToRead !== false,
      sayTown: s.sayTown === true,
      units: s.units === 'c' ? 'c' : 'f',
      readAlerts: s.readAlerts === true
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      return validate(Object.assign({}, DEFAULTS, raw ? JSON.parse(raw) : {}));
    } catch (e) {
      return Object.assign({}, DEFAULTS);
    }
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      // Storage can be unavailable (private window, blocked site data). Settings still apply for this visit.
    }
  }

  function apply() {
    const root = document.documentElement;
    root.dataset.bg = state.bg;
    root.dataset.palette = state.color ? state.palette : 'none';
    root.style.setProperty('--scale', SIZE_STEPS[state.size]);
    root.classList.toggle('tap-read', state.tapToRead);

    // Match the window title bar to the page background.
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      const cream = state.bg === 'light' && state.color && state.palette === 'yellow';
      meta.content = state.bg === 'dark' ? '#000000' : cream ? '#FFFFC8' : '#FFFFFF';
    }
  }

  function setMany(changes) {
    state = validate(Object.assign({}, state, changes));
    save();
    apply();
    listeners.forEach(fn => fn(state));
  }

  apply();

  return {
    SIZE_STEPS,
    RATE_STEPS,
    get: () => Object.assign({}, state),
    set: (key, value) => setMany({ [key]: value }),
    setMany,
    reset: () => setMany(DEFAULTS),
    rate: () => RATE_STEPS[state.rate].rate,
    onChange: fn => listeners.push(fn)
  };
})();
