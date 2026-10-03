// The person's places: saved on this device, in order. The first one is where the app opens.
// New places come from the Open-Meteo place search (town name or ZIP code).
//   place: { id, name, spokenName, latitude, longitude, timezone, country }
//   for example "Chicago, IL" is shown and "Chicago, Illinois" is spoken. country is the two-letter
//   code ("US"), used to skip the US-only weather warnings elsewhere; older saved places may lack it.
window.Weather = window.Weather || {};

Weather.places = (function () {
  const KEY = 'weather.places.v1';
  const SEARCH_URL = 'https://geocoding-api.open-meteo.com/v1/search';
  const TIMEOUT_MS = 15000;

  const DEFAULT_PLACES = [
    { id: 'g4887398', name: 'Chicago, IL', spokenName: 'Chicago, Illinois',
      latitude: 41.85003, longitude: -87.65005, timezone: 'America/Chicago', country: 'US' }
  ];

  const STATES = {
    Alabama: 'AL', Alaska: 'AK', Arizona: 'AZ', Arkansas: 'AR', California: 'CA', Colorado: 'CO',
    Connecticut: 'CT', Delaware: 'DE', 'District of Columbia': 'DC', 'Washington, D.C.': 'DC', Florida: 'FL',
    Georgia: 'GA', Hawaii: 'HI', Idaho: 'ID', Illinois: 'IL', Indiana: 'IN', Iowa: 'IA', Kansas: 'KS',
    Kentucky: 'KY', Louisiana: 'LA', Maine: 'ME', Maryland: 'MD', Massachusetts: 'MA', Michigan: 'MI',
    Minnesota: 'MN', Mississippi: 'MS', Missouri: 'MO', Montana: 'MT', Nebraska: 'NE', Nevada: 'NV',
    'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY', 'North Carolina': 'NC',
    'North Dakota': 'ND', Ohio: 'OH', Oklahoma: 'OK', Oregon: 'OR', Pennsylvania: 'PA', 'Rhode Island': 'RI',
    'South Carolina': 'SC', 'South Dakota': 'SD', Tennessee: 'TN', Texas: 'TX', Utah: 'UT', Vermont: 'VT',
    Virginia: 'VA', Washington: 'WA', 'West Virginia': 'WV', Wisconsin: 'WI', Wyoming: 'WY',
    'Puerto Rico': 'PR', Guam: 'GU', 'U.S. Virgin Islands': 'VI', 'American Samoa': 'AS',
    'Northern Mariana Islands': 'MP'
  };

  const isText = v => typeof v === 'string' && v.trim() !== '';
  const isNumber = v => typeof v === 'number' && isFinite(v);

  const listeners = [];
  let list = load(); // after the helpers above, which load() uses

  // Never trust stored values: a bad entry is dropped, and an empty list goes back to Chicago.
  function valid(p) {
    return p && isText(p.id) && isText(p.name) && isText(p.spokenName) &&
      isNumber(p.latitude) && isNumber(p.longitude) && (p.timezone == null || isText(p.timezone)) &&
      (p.country == null || isText(p.country));
  }

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY));
      const good = Array.isArray(saved) ? saved.filter(valid) : [];
      if (good.length) return good;
    } catch (e) { /* storage unavailable or damaged */ }
    return DEFAULT_PLACES.map(p => Object.assign({}, p));
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(list));
    } catch (e) {
      // Storage can be unavailable (private window, blocked site data). Places still work for this visit.
    }
  }

  function changed() {
    save();
    listeners.forEach(fn => fn(all()));
  }

  const all = () => list.map(p => Object.assign({}, p));
  const indexOf = id => list.findIndex(p => p.id === id);

  function add(place) {
    if (indexOf(place.id) !== -1) return false;
    list.push(Object.assign({}, place));
    changed();
    return true;
  }

  function replace(id, place) {
    const i = indexOf(id);
    if (i === -1) return false;
    const other = indexOf(place.id);
    if (other !== -1 && other !== i) return false; // already in the list somewhere else
    list[i] = Object.assign({}, place);
    changed();
    return true;
  }

  function remove(id) {
    const i = indexOf(id);
    if (i === -1 || list.length < 2) return false; // there is always at least one place
    list.splice(i, 1);
    changed();
    return true;
  }

  function move(id, dir) {
    const i = indexOf(id);
    const j = i + dir;
    if (i === -1 || j < 0 || j >= list.length) return false;
    [list[i], list[j]] = [list[j], list[i]];
    changed();
    return true;
  }

  // --- Place search ----------------------------------------------------------------------------

  const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

  // A search result becomes a place. US places use the state: "Chicago, IL" / "Chicago, Illinois".
  // Other places use the country: "Toronto, Canada".
  function fromResult(r) {
    const us = r.country_code === 'US';
    const region = us ? r.admin1 : r.country;
    const short = us && r.admin1 ? STATES[r.admin1] || r.admin1 : region;
    return {
      id: 'g' + r.id,
      name: short ? `${r.name}, ${short}` : r.name,
      spokenName: region ? `${r.name}, ${region}` : r.name,
      latitude: r.latitude,
      longitude: r.longitude,
      timezone: r.timezone || null,
      country: r.country_code || null
    };
  }

  // Resolves to [{ place, label }]. Rejects with Error('offline' | 'service').
  // "Springfield, IL" also works: the part after the comma narrows the matches to that state or country.
  async function search(query) {
    const [rawName, ...rest] = query.split(',');
    const name = rawName.trim();
    const hint = fold(rest.join(','));
    const zip = /^\d{5}$/.test(name);

    const url = new URL(SEARCH_URL);
    url.search = new URLSearchParams({ name, count: '20', language: 'en', format: 'json' });
    if (zip) url.searchParams.set('countryCode', 'US');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let data;
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error('service');
      data = await res.json();
    } catch (e) {
      throw new Error(navigator.onLine === false ? 'offline' : 'service');
    } finally {
      clearTimeout(timer);
    }

    let results = (data && Array.isArray(data.results) ? data.results : [])
      .filter(r => r && isNumber(r.latitude) && isNumber(r.longitude) && isText(r.name));

    // The search also returns loose matches (Springfield finds "Palmyra"). Keep the real ones.
    if (!zip) {
      const close = results.filter(r => fold(r.name).includes(fold(name)));
      if (close.length) results = close;
    }
    if (hint) {
      const narrowed = results.filter(r =>
        [r.admin1, r.country, r.country_code, STATES[r.admin1]].some(v => fold(v) === hint));
      if (narrowed.length) results = narrowed;
    }

    // Two towns with the same name in the same state are told apart by their county.
    const counts = {};
    results.forEach(r => { const k = fold(fromResult(r).spokenName); counts[k] = (counts[k] || 0) + 1; });
    return results.slice(0, 8).map(r => {
      const place = fromResult(r);
      if (!(counts[fold(place.spokenName)] > 1 && isText(r.admin2))) return { place, label: place.spokenName };
      const named = r.country_code !== 'US' || /county|parish|borough|census area/i.test(r.admin2);
      return { place, label: `${place.spokenName} (${r.admin2}${named ? '' : ' County'})` };
    });
  }

  return {
    all,
    get: id => all().find(p => p.id === id) || null,
    add,
    replace,
    remove,
    move,
    search,
    onChange: fn => listeners.push(fn)
  };
})();
