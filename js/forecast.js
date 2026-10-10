// Live forecasts from Open-Meteo (free, no key). The last forecast for each place is kept on this
// device, so the app still shows the weather when the internet is down.
//   forecast: { current: { temp, condition }, days: [{ date, high, low, rain, hours }] }
//   hours: [{ hour, temp, feels, rain }], the day's hours (0-23) in the place's own time.
//   days[0] is today in the place's own time zone; up to 7 days. Temperatures are whole °F.
//   Forecasts saved before hourly numbers were added have no hours until the next refresh.
window.Weather = window.Weather || {};

Weather.forecast = (function () {
  const KEY = 'weather.forecasts.v1';
  const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
  const TIMEOUT_MS = 15000;
  const words = Weather.words;

  const isNumber = v => typeof v === 'number' && isFinite(v);
  const isDate = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
  const isHour = h => h && Number.isInteger(h.hour) && h.hour >= 0 && h.hour <= 23 &&
    isNumber(h.temp) && isNumber(h.feels) && isNumber(h.rain);
  const percent = v => (isNumber(v) ? Math.min(100, Math.max(0, Math.round(v))) : 0);

  const listeners = [];
  const status = {};  // placeId → { loading, error: null | 'offline' | 'service', tried: time of last attempt }
  let cache = load(); // placeId → { fetchedAt, timezone, current, days }; after the helpers above

  function validEntry(e) {
    return e && isNumber(e.fetchedAt) && e.current && isNumber(e.current.temp) &&
      typeof e.current.condition === 'string' && Array.isArray(e.days) && e.days.length > 0 &&
      e.days.every(d => d && isDate(d.date) && isNumber(d.high) && isNumber(d.low) && isNumber(d.rain) &&
        (d.hours === undefined || (Array.isArray(d.hours) && d.hours.every(isHour))));
  }

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY)) || {};
      const good = {};
      Object.keys(saved).forEach(id => { if (validEntry(saved[id])) good[id] = saved[id]; });
      return good;
    } catch (e) {
      return {};
    }
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(cache));
    } catch (e) { /* storage unavailable: the forecast still shows for this visit */ }
  }

  // Today's date (YYYY-MM-DD) where the place is, so "Today" is right even in another time zone.
  function today(timezone) {
    const now = new Date();
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone || undefined, year: 'numeric', month: '2-digit', day: '2-digit'
      }).formatToParts(now);
      const part = type => parts.find(p => p.type === type).value;
      return `${part('year')}-${part('month')}-${part('day')}`;
    } catch (e) {
      const pad = n => String(n).padStart(2, '0');
      return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    }
  }

  // The saved forecast for a place, starting from today. Days that have already passed are dropped.
  function get(placeId) {
    const entry = cache[placeId];
    if (!entry) return null;
    const from = today(entry.timezone);
    const days = entry.days.filter(d => d.date >= from)
      .map(d => Object.assign({}, d, d.hours ? { hours: d.hours.map(h => Object.assign({}, h)) } : {}));
    if (!days.length) return null;
    return { fetchedAt: entry.fetchedAt, forecast: { current: Object.assign({}, entry.current), days } };
  }

  function normalize(data) {
    const c = (data && data.current) || {};
    const d = (data && data.daily) || {};
    const h = (data && data.hourly) || {};
    if (!isNumber(c.temperature_2m) || !Array.isArray(d.time)) throw new Error('service');
    const pick = (list, i) => (Array.isArray(list) ? list[i] : null);

    // Hourly times are the place's own clock ("2026-10-10T14:00"), grouped into their days.
    const hoursByDate = {};
    (Array.isArray(h.time) ? h.time : []).forEach((time, i) => {
      const date = typeof time === 'string' ? time.slice(0, 10) : '';
      const hour = typeof time === 'string' ? Number(time.slice(11, 13)) : NaN;
      const temp = pick(h.temperature_2m, i);
      if (!isDate(date) || !Number.isInteger(hour) || !isNumber(temp)) return;
      const feels = pick(h.apparent_temperature, i);
      (hoursByDate[date] = hoursByDate[date] || []).push({
        hour,
        temp: Math.round(temp),
        feels: Math.round(isNumber(feels) ? feels : temp),
        rain: percent(pick(h.precipitation_probability, i))
      });
    });
    const days = d.time
      .map((date, i) => ({
        date,
        high: pick(d.temperature_2m_max, i),
        low: pick(d.temperature_2m_min, i),
        rain: pick(d.precipitation_probability_max, i)
      }))
      .filter(day => isDate(day.date) && isNumber(day.high) && isNumber(day.low))
      .map(day => ({
        date: day.date,
        high: Math.round(day.high),
        low: Math.round(day.low),
        rain: percent(day.rain),
        hours: hoursByDate[day.date] || []
      }));
    if (!days.length) throw new Error('service');
    return {
      fetchedAt: Date.now(),
      timezone: typeof data.timezone === 'string' ? data.timezone : null,
      current: { temp: Math.round(c.temperature_2m), condition: words.condition(c.weather_code, c.is_day) },
      days
    };
  }

  async function refresh(place) {
    const s = status[place.id] = status[place.id] || { loading: false, error: null, tried: 0 };
    if (s.loading) return;
    s.loading = true;
    s.tried = Date.now();
    notify(place.id);

    const url = new URL(FORECAST_URL);
    url.search = new URLSearchParams({
      latitude: place.latitude,
      longitude: place.longitude,
      current: 'temperature_2m,weather_code,is_day',
      daily: 'temperature_2m_max,temperature_2m_min,precipitation_probability_max',
      hourly: 'temperature_2m,apparent_temperature,precipitation_probability',
      temperature_unit: 'fahrenheit',
      timezone: 'auto',
      forecast_days: '7'
    });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error('service');
      cache[place.id] = normalize(await res.json());
      s.error = null;
      save();
    } catch (e) {
      s.error = navigator.onLine === false ? 'offline' : 'service';
    } finally {
      clearTimeout(timer);
      s.loading = false;
      notify(place.id);
    }
  }

  // Drops saved forecasts for places that were removed.
  function keepOnly(placeIds) {
    Object.keys(cache).forEach(id => { if (!placeIds.includes(id)) delete cache[id]; });
    Object.keys(status).forEach(id => { if (!placeIds.includes(id)) delete status[id]; });
    save();
  }

  function notify(placeId) {
    listeners.forEach(fn => fn(placeId));
  }

  return {
    get,
    status: id => Object.assign({ loading: false, error: null, tried: 0 }, status[id]),
    refresh,
    keepOnly,
    onChange: fn => listeners.push(fn)
  };
})();
