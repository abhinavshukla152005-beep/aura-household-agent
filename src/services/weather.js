import { getJson } from './http.js';

const WMO = {
  0: 'clear sky', 1: 'mostly clear', 2: 'partly cloudy', 3: 'overcast',
  45: 'fog', 48: 'freezing fog', 51: 'light drizzle', 53: 'drizzle', 55: 'heavy drizzle',
  61: 'light rain', 63: 'rain', 65: 'heavy rain', 66: 'freezing rain', 67: 'sleet',
  71: 'light snow', 73: 'snow', 75: 'heavy snow', 77: 'snow grains',
  80: 'rain showers', 81: 'rain showers', 82: 'violent rain showers',
  85: 'snow showers', 86: 'heavy snow showers',
  95: 'thunderstorm', 96: 'thunderstorm with hail', 99: 'severe thunderstorm with hail'
};

export function isInclement(code) {
  return code >= 51 && code <= 99;
}

/** Current conditions + today's outlook for a place name. */
export async function lookupWeather(place = 'Pune, India') {
  const geo = await getJson(
    `https://geocoding-api.open-meteo.com/v1/search?count=1&name=${encodeURIComponent(place)}`,
    { fixture: 'geocode.json' }
  );
  const hit = geo.data?.results?.[0];
  if (!hit) throw new Error(`Could not resolve place "${place}"`);

  const url = 'https://api.open-meteo.com/v1/forecast'
    + `?latitude=${hit.latitude}&longitude=${hit.longitude}&timezone=auto`
    + '&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m'
    + '&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max';
  const wx = await getJson(url, { fixture: 'weather.json' });
  const cur = wx.data.current;
  const day = wx.data.daily;

  return {
    source: wx.source,
    place: `${hit.name}${hit.admin1 ? ', ' + hit.admin1 : ''}, ${hit.country}`,
    localTime: new Intl.DateTimeFormat('en-GB', {
      timeZone: wx.data.timezone, hour: '2-digit', minute: '2-digit', weekday: 'short'
    }).format(new Date()),
    timezone: wx.data.timezone,
    tempC: cur.temperature_2m,
    feelsLikeC: cur.apparent_temperature,
    humidity: cur.relative_humidity_2m,
    windKph: cur.wind_speed_10m,
    condition: WMO[cur.weather_code] ?? `code ${cur.weather_code}`,
    weatherCode: cur.weather_code,
    inclement: isInclement(cur.weather_code),
    highC: day.temperature_2m_max?.[0],
    lowC: day.temperature_2m_min?.[0],
    rainChance: day.precipitation_probability_max?.[0],
    sunset: day.sunset?.[0],
    spoken: `${cur.temperature_2m} degrees and ${WMO[cur.weather_code] ?? 'unsettled'} in ${hit.name}`
      + (day.precipitation_probability_max?.[0] > 55 ? ', high chance of rain later' : '')
  };
}
