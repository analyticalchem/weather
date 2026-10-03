// Sample places and forecasts for the Phase 1 prototype. None of this is real weather.
// Phase 2 replaces it with live Open-Meteo data in the same shape:
//   place:    { id, name, spokenName }
//   forecast: { current: { temp, condition }, days: [{ high, low, rain }] }  (days[0] is today, 7 days)
window.Weather = window.Weather || {};

Weather.sampleData = (function () {
  const days = rows => rows.map(([high, low, rain]) => ({ high, low, rain }));

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
