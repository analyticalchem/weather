// Severe weather alerts from the US National Weather Service (weather.gov: free, no key, US only).
// Checked only while the app is open, so this is no substitute for phone emergency alerts or a
// weather radio. Alerts are silent by default: they show as a banner, and are read out when
// clicked, by the Read aloud button, or (if the "Read new warnings aloud" setting is on) once
// when they first appear.
//   alert: { id, event, ends, instruction, details }   (ends: time in ms, or null)
window.Weather = window.Weather || {};

Weather.alerts = (function () {
  const KEY = 'weather.alerts.v1';
  const ALERTS_URL = 'https://api.weather.gov/alerts/active';
  const TIMEOUT_MS = 15000;
  const MAX_TEXT = 600; // spoken details are cut at a sentence end after this many characters

  const isText = v => typeof v === 'string' && v.trim() !== '';
  const isNumber = v => typeof v === 'number' && isFinite(v);

  // Which warnings have been read out (by "Read new warnings aloud", Read aloud, or a click), so
  // each is read only once. A warning that's extended has a new end time, so it counts as new.
  const ANNOUNCED_KEY = 'weather.announced.v1';
  const announceKey = (placeId, a) => `${placeId}|${a.event}|${a.ends}`;

  function loadAnnounced() {
    try {
      const data = JSON.parse(localStorage.getItem(ANNOUNCED_KEY)) || {};
      const good = {};
      Object.keys(data).forEach(k => { if (isNumber(data[k])) good[k] = data[k]; });
      return good;
    } catch (e) {
      return {};
    }
  }

  const listeners = [];
  const status = {};  // placeId → { loading, error, tried, checked: time of last successful check, unsupported }
  let saved = load(); // placeId → { checked, alerts: [...] }; after the helpers above
  let announced = loadAnnounced(); // announceKey → when it can be forgotten (ms)

  function markAnnounced(placeId, alerts) {
    const now = Date.now();
    alerts.forEach(a => { announced[announceKey(placeId, a)] = a.ends || now + 7 * 86400000; });
    Object.keys(announced).forEach(k => { if (announced[k] < now - 86400000) delete announced[k]; });
    try {
      localStorage.setItem(ANNOUNCED_KEY, JSON.stringify(announced));
    } catch (e) { /* storage unavailable: remembered for this visit only */ }
  }

  function validAlert(a) {
    return a && isText(a.id) && isText(a.event) && (a.ends === null || isNumber(a.ends)) &&
      typeof a.instruction === 'string' && typeof a.details === 'string';
  }

  function load() {
    try {
      const data = JSON.parse(localStorage.getItem(KEY)) || {};
      const good = {};
      Object.keys(data).forEach(id => {
        const e = data[id];
        if (e && isNumber(e.checked) && Array.isArray(e.alerts)) good[id] = { checked: e.checked, alerts: e.alerts.filter(validAlert) };
      });
      return good;
    } catch (e) {
      return {};
    }
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(saved));
    } catch (e) { /* storage unavailable: alerts still show for this visit */ }
  }

  // Weather service text is often in capitals with hard line breaks. Make it read like a sentence.
  function tidy(text) {
    let t = String(text || '')
      .replace(/\b(WHAT|WHERE|WHEN|IMPACTS?|HAZARD|SOURCE|ADDITIONAL DETAILS|PRECAUTIONARY\/PREPAREDNESS ACTIONS)\.\.\./g, '')
      .replace(/\*\s*/g, '')
      .replace(/\.{3,}/g, ', ')
      .replace(/\s+/g, ' ')
      .trim();
    const letters = t.replace(/[^A-Za-z]/g, '');
    if (letters && letters.replace(/[^A-Z]/g, '').length / letters.length > 0.7) {
      t = t.toLowerCase().replace(/(^|[.!?]\s+)([a-z])/g, (m, p, c) => p + c.toUpperCase());
    }
    if (t.length > MAX_TEXT) {
      const cut = t.slice(0, MAX_TEXT);
      const end = cut.lastIndexOf('. ');
      t = end > 100 ? cut.slice(0, end + 1) : cut + '…';
    }
    return t;
  }

  // Shows the alerts that matter for safety: anything the weather service rates Severe or Extreme,
  // and anything it calls a Warning. Advisories, statements and tests are left out.
  function keep(p) {
    if (!p || p.status !== 'Actual' || p.messageType === 'Cancel' || !isText(p.event)) return false;
    if (/test/i.test(p.event)) return false;
    return p.severity === 'Extreme' || p.severity === 'Severe' || /(warning|emergency)$/i.test(p.event.trim());
  }

  // Most urgent first: Extreme, then warnings, then watches and the rest; sooner-ending first.
  function rank(p) {
    if (p.severity === 'Extreme') return 0;
    return /(warning|emergency)$/i.test(p.event.trim()) ? 1 : 2;
  }
  const endTime = p => Date.parse(p.ends || p.expires) || Infinity;

  function normalize(data) {
    const features = data && Array.isArray(data.features) ? data.features : null;
    if (!features) throw new Error('service');
    return features
      .map(f => f && f.properties)
      .filter(keep)
      .sort((a, b) => rank(a) - rank(b) || endTime(a) - endTime(b))
      .map(p => {
        const ends = Date.parse(p.ends || p.expires);
        return {
          id: String(p.id || p['@id'] || p.event + p.onset),
          event: p.event.trim(),
          ends: isNaN(ends) ? null : ends,
          instruction: tidy(p.instruction),
          details: tidy(p.description)
        };
      })
      // The same warning can come twice (an update and the original); keep one of each.
      .filter((a, i, list) => list.findIndex(b => b.event === a.event && b.ends === a.ends) === i);
  }

  // Alerts for a place that haven't ended yet.
  function get(placeId) {
    const entry = saved[placeId];
    if (!entry) return [];
    const now = Date.now();
    return entry.alerts.filter(a => a.ends === null || a.ends > now).map(a => Object.assign({}, a));
  }

  async function refresh(place) {
    const s = status[place.id] = status[place.id] ||
      { loading: false, error: null, tried: 0, checked: saved[place.id] ? saved[place.id].checked : 0, unsupported: false };
    if (s.loading || s.unsupported) return;
    if (place.country && place.country !== 'US') { s.unsupported = true; return; }
    s.loading = true;
    s.tried = Date.now();
    notify(place.id);

    const url = new URL(ALERTS_URL);
    url.searchParams.set('point', `${place.latitude.toFixed(4)},${place.longitude.toFixed(4)}`);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/geo+json' } });
      if (res.status === 400 || res.status === 404) { // outside the area the weather service covers
        s.unsupported = true;
        s.error = null;
        delete saved[place.id];
      } else {
        if (!res.ok) throw new Error('service');
        saved[place.id] = { checked: Date.now(), alerts: normalize(await res.json()) };
        s.checked = saved[place.id].checked;
        s.error = null;
      }
      save();
    } catch (e) {
      s.error = navigator.onLine === false ? 'offline' : 'service';
    } finally {
      clearTimeout(timer);
      s.loading = false;
      notify(place.id);
    }
  }

  function keepOnly(placeIds) {
    Object.keys(saved).forEach(id => { if (!placeIds.includes(id)) delete saved[id]; });
    Object.keys(status).forEach(id => { if (!placeIds.includes(id)) delete status[id]; });
    save();
  }

  function notify(placeId) {
    listeners.forEach(fn => fn(placeId));
  }

  return {
    get,
    isAnnounced: (placeId, alert) => Object.prototype.hasOwnProperty.call(announced, announceKey(placeId, alert)),
    markAnnounced,
    status: id => Object.assign({ loading: false, error: null, tried: 0, checked: saved[id] ? saved[id].checked : 0, unsupported: false }, status[id]),
    refresh,
    keepOnly,
    onChange: fn => listeners.push(fn)
  };
})();
