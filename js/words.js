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
  function dayLabels(count, from) {
    const start = from ? new Date(from) : new Date();
    const labels = [];
    for (let i = 0; i < count; i++) {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      labels.push(i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString('en-US', { weekday: 'long' }));
    }
    return labels;
  }

  function list(items) {
    if (items.length < 3) return items.join(' and ');
    return items.slice(0, -1).join(', ') + ', and ' + items[items.length - 1];
  }

  return {
    temp,
    spoken,
    dayLabels,
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
