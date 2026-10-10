// Everything the app shows as a number or says out loud is worded here,
// so the screen and the voice always agree.
window.Weather = window.Weather || {};

Weather.words = (function () {
  const MINUS = '−'; // a true minus sign is wider and easier to see than a hyphen

  function temp(t) {
    return (t < 0 ? MINUS + Math.abs(t) : String(t)) + '°';
  }

  function spoken(t) {
    return t < 0 ? 'minus ' + Math.abs(t) : String(t);
  }

  // "Today", "Tomorrow", then full weekday names. Full names are easier to read than "Wed".
  // dates are the forecast's own days (YYYY-MM-DD), so the names match the place's calendar.
  function dayLabels(dates) {
    return dates.map((date, i) => {
      if (i === 0) return 'Today';
      if (i === 1) return 'Tomorrow';
      const [y, m, d] = date.split('-').map(Number);
      return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
    });
  }

  function list(items) {
    if (items.length < 3) return items.join(' and ');
    return items.slice(0, -1).join(', ') + ', and ' + items[items.length - 1];
  }

  // Open-Meteo weather codes (WMO) in plain words.
  function condition(code, isDay) {
    switch (code) {
      case 0: return isDay === 0 ? 'Clear' : 'Sunny';
      case 1: return isDay === 0 ? 'Mostly clear' : 'Mostly sunny';
      case 2: return 'Partly cloudy';
      case 3: return 'Cloudy';
      case 45: case 48: return 'Fog';
      case 51: return 'Light drizzle';
      case 53: return 'Drizzle';
      case 55: return 'Heavy drizzle';
      case 56: case 57: return 'Freezing drizzle';
      case 61: return 'Light rain';
      case 63: return 'Rain';
      case 65: return 'Heavy rain';
      case 66: case 67: return 'Freezing rain';
      case 71: return 'Light snow';
      case 73: return 'Snow';
      case 75: return 'Heavy snow';
      case 77: return 'Snow grains';
      case 80: return 'Light showers';
      case 81: return 'Showers';
      case 82: return 'Heavy showers';
      case 85: return 'Light snow showers';
      case 86: return 'Heavy snow showers';
      case 95: return 'Thunderstorms';
      case 96: case 99: return 'Thunderstorms with hail';
      default: return '';
    }
  }

  // How old a saved forecast is: "3 hours ago", "yesterday", "4 days ago".
  function age(ms) {
    const hours = Math.max(1, Math.round(ms / 3600000));
    if (hours < 24) return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
    const days = Math.floor(hours / 24);
    return days === 1 ? 'yesterday' : `${days} days ago`;
  }

  // When a weather alert ends, in the place's own time: "until 4:45 PM", "until tomorrow at noon",
  // "until Monday at 6:00 AM", "until midnight tonight". Midnight and noon are said in words,
  // because "12:00 AM" confuses people, and midnight belongs to the night before it.
  function until(ms, timezone) {
    if (ms == null) return '';
    const zone = { timeZone: timezone || undefined };
    const day = t => new Date(t).toLocaleDateString('en-US', Object.assign({ year: 'numeric', month: 'numeric', day: 'numeric' }, zone));
    const weekday = t => new Date(t).toLocaleDateString('en-US', Object.assign({ weekday: 'long' }, zone));
    const clock = new Date(ms).toLocaleTimeString('en-US', Object.assign({ hour: 'numeric', minute: '2-digit' }, zone));
    const now = Date.now();
    const DAY = 86400000;

    if (clock === '12:00 AM') {
      const night = ms - 60000; // the evening that this midnight ends
      if (day(night) === day(now)) return 'until midnight tonight';
      if (day(night) === day(now + DAY)) return 'until midnight tomorrow night';
      return `until midnight ${weekday(night)} night`;
    }
    const time = clock === '12:00 PM' ? 'noon' : clock;
    if (day(ms) === day(now)) return `until ${time}`;
    if (day(ms) === day(now + DAY)) return `until tomorrow at ${time}`;
    return `until ${weekday(ms)} at ${time}`;
  }

  const PROBLEM = {
    offline: 'No internet connection.',
    service: "Can't reach the weather service."
  };

  // On screen: "12 AM", "4 AM", "Noon", "4 PM".
  function hourLabel(hour) {
    if (hour === 0) return '12 AM';
    if (hour === 12) return 'Noon';
    return (hour % 12) + (hour < 12 ? ' AM' : ' PM');
  }

  // Out loud: "midnight" and "noon" are clearer than "12 AM" and "12 PM".
  function spokenHour(hour) {
    if (hour === 0) return 'midnight';
    if (hour === 12) return 'noon';
    return hourLabel(hour);
  }

  // "Today" and "Tomorrow" in the middle of a sentence.
  const inSentence = label => (label === 'Today' || label === 'Tomorrow' ? label.toLowerCase() : label);

  const capitalize = text => text.charAt(0).toUpperCase() + text.slice(1);

  function tempHourly(hours, label) {
    const coldest = hours.reduce((a, b) => (b.temp < a.temp ? b : a));
    const warmest = hours.reduce((a, b) => (b.temp > a.temp ? b : a));
    return `Temperature hour by hour for ${inSentence(label)}. ` +
      `Coldest ${spoken(coldest.temp)} degrees at ${spokenHour(coldest.hour)}. ` +
      `Warmest ${spoken(warmest.temp)} degrees at ${spokenHour(warmest.hour)}.`;
  }

  function rainHourly(hours, label) {
    const wettest = hours.reduce((a, b) => (b.rain > a.rain ? b : a));
    return `Chance of rain hour by hour for ${inSentence(label)}. ` +
      (wettest.rain === 0
        ? 'No rain expected.'
        : `Highest chance ${wettest.rain} percent at ${spokenHour(wettest.hour)}.`);
  }

  // A block of hours, e.g. "4 AM to 8 AM" on screen and "8 PM to midnight" out loud.
  const blockLabel = (start, length) => `${hourLabel(start)} to ${hourLabel((start + length) % 24)}`;
  const blockSpoken = (start, length) =>
    capitalize(`${spokenHour(start)} to ${spokenHour((start + length) % 24)}`) + '.';

  return {
    temp,
    spoken,
    dayLabels,
    condition,
    // The notice under the town name. Shown only when something needs saying.
    loading: place => `Getting the weather for ${place.spokenName}.`,
    noForecast: error => `${PROBLEM[error] || PROBLEM.service} The weather will appear as soon as it can be reached.`,
    oldForecast: (ms, error) => (error ? PROBLEM[error] + ' ' : '') + `This forecast is from ${age(ms)}.`,
    // Weather alerts (silent: heard only when clicked or by Read aloud)
    until,
    alertSay: (alert, untilText) =>
      `Weather alert. ${alert.event}${untilText ? ', ' + untilText : ''}. ${alert.instruction || alert.details}`.trim(),
    alertNew: (place, alert, untilText) =>
      `New weather alert for ${place.spokenName}. ${alert.event}${untilText ? ', ' + untilText : ''}. ${alert.instruction || alert.details}`.trim(),
    alertsUnchecked: "Can't check for weather warnings right now.",
    updateReady: version => `A newer version (${version}) is ready. Close the app and open it again to get it.`,
    // Settings → Places
    placeAdded: place => `Added ${place.spokenName}.`,
    placeChanged: (from, to) => `Changed ${from.spokenName} to ${to.spokenName}.`,
    placeRemoved: place => `Removed ${place.spokenName}.`,
    placeAlready: place => `${place.spokenName} is already in your places.`,
    lastPlace: 'You need at least one place. To pick a different town, use Change.',
    searchShort: 'Type at least 2 letters of the town name, or a 5-digit ZIP code.',
    searching: 'Searching.',
    searchFound: count => (count === 1 ? '1 place found. Click it to choose it.' : `${count} places found. Click the right one.`),
    searchNone: query => `No places found for "${query}". Check the spelling, or try a ZIP code.`,
    searchFailed: error => (error === 'offline'
      ? 'No internet connection. Try again when the internet is back.'
      : "Can't reach the place search. Try again in a minute."),
    hourLabel,
    blockLabel,
    blockSpoken,
    hourTemp: h => `${capitalize(spokenHour(h.hour))}: ${spoken(h.temp)} degrees, feels like ${spoken(h.feels)}.`,
    hourRain: h => `${capitalize(spokenHour(h.hour))}: ${h.rain} percent chance of rain.`,
    tempHourly,
    rainHourly,
    place: (place, index, count) =>
      count > 1 ? `${place.spokenName}. Place ${index + 1} of ${count}.` : `${place.spokenName}.`,
    nowTemp: current =>
      `It's ${spoken(current.temp)} degrees right now.` + (current.condition ? ` ${current.condition}.` : ''),
    hiLo: day => `Today's high is ${spoken(day.high)} degrees, and the low is ${spoken(day.low)}.`,
    rainToday: day => `${day.rain} percent chance of rain today.`,
    tempDay: (day, label) => `${label}: high of ${spoken(day.high)}, low of ${spoken(day.low)}.`,
    rainDay: (day, label) => `${label}: ${day.rain} percent chance of rain.`,
    dayFull: (day, label) =>
      `${label}: high of ${spoken(day.high)}, low of ${spoken(day.low)}, and a ${day.rain} percent chance of rain.`,
    range: (shown, total) => `Showing ${list(shown)}. ${total} days in all.`
  };
})();
