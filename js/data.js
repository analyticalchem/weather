// Test data only: the app doesn't load this file. The live app gets places from js/places.js and
// forecasts from Open-Meteo (js/forecast.js). These made-up values are kept for testing layouts.
// Live forecasts also give each day a date (YYYY-MM-DD), which day names are taken from.
//   place:    { id, name, spokenName }
//   forecast: { current: { temp, condition }, days: [{ high, low, rain, hours }] }  (days[0] is today, 7 days)
//   hours:    [{ hour, temp, feels, rain }]  (hour 0-23; Open-Meteo: temperature_2m, apparent_temperature,
//             precipitation_probability)
window.Weather = window.Weather || {};

Weather.sampleData = (function () {
  // Hour at which each sample day's rain chance peaks, so the hourly rain graphs differ from day to day.
  const RAIN_PEAK_HOURS = [15, 9, 18, 13, 20, 11, 16];

  // How far through the day's warm-up we are: 0 at the 6 AM low, 1 at the 3 PM high.
  function warmth(hour) {
    if (hour >= 6 && hour <= 15) return (1 - Math.cos(Math.PI * (hour - 6) / 9)) / 2;
    const sinceHigh = (hour < 6 ? hour + 24 : hour) - 15;
    return (1 + Math.cos(Math.PI * sinceHigh / 15)) / 2;
  }

  function feelsLike(temp, hour) {
    if (temp >= 75) return temp + Math.round((temp - 72) / 3); // humid
    if (temp <= 55) return temp - 2 - (hour % 3);                // windy and cold
    return temp - 1;
  }

  // Hourly values consistent with the day: the low at 6 AM, the high at 3 PM,
  // and the day's rain chance as the highest hourly chance.
  function hoursFor(day, dayIndex) {
    const peak = RAIN_PEAK_HOURS[dayIndex % RAIN_PEAK_HOURS.length];
    return Array.from({ length: 24 }, (_, hour) => {
      const temp = Math.round(day.low + (day.high - day.low) * warmth(hour));
      const rain = Math.round(day.rain * Math.exp(-Math.pow((hour - peak) / 3.5, 2)) / 5) * 5;
      return { hour, temp, feels: feelsLike(temp, hour), rain };
    });
  }

  const days = rows => rows.map(([high, low, rain], i) => {
    const day = { high, low, rain };
    day.hours = hoursFor(day, i);
    return day;
  });

  return {
    places: [
      { id: 'springfield', name: 'Springfield, IL', spokenName: 'Springfield, Illinois' },
      { id: 'denver', name: 'Denver, CO', spokenName: 'Denver, Colorado' },
      { id: 'portland', name: 'Portland, ME', spokenName: 'Portland, Maine' }
    ],
    forecasts: {
      springfield: {
        current: { temp: 72, condition: 'Partly cloudy' },
        days: days([[80, 61, 30], [74, 58, 70], [67, 50, 10], [70, 52, 0], [76, 57, 20], [82, 63, 40], [79, 60, 60]])
      },
      denver: {
        current: { temp: 58, condition: 'Sunny' },
        days: days([[64, 39, 10], [70, 42, 0], [55, 33, 40], [41, 24, 80], [52, 31, 30], [61, 36, 10], [66, 40, 0]])
      },
      portland: {
        current: { temp: 49, condition: 'Light rain' },
        days: days([[55, 44, 80], [52, 40, 60], [60, 45, 20], [58, 43, 10], [54, 41, 50], [50, 38, 90], [53, 39, 30]])
      }
    }
  };
})();
