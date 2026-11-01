import { randomBytes, randomUUID } from 'node:crypto';
import { Parser } from 'expr-eval';
import { config } from '../config.js';

const parser = new Parser({
  operators: {
    add: true, subtract: true, multiply: true, divide: true,
    remainder: true, power: true, factorial: false,
    comparison: false, logical: false, conditional: false, assignment: false
  }
});

function safeFetch(url, options = {}) {
  return fetch(url, { ...options, signal: AbortSignal.timeout(12000) });
}

export function calculate(expression) {
  const input = expression.trim();
  if (!input || input.length > 120 || !/^[0-9+\-*/().,%^\s]+$/.test(input)) {
    throw new Error('Use numbers and basic operators only. Example: /calc (18 + 7) * 3 / 5');
  }
  const normalized = input.replace(/\^/g, '^').replace(/(\d+(?:\.\d+)?)\s*%/g, '($1/100)');
  const value = parser.evaluate(normalized);
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error('That expression does not produce a valid finite number.');
  }
  return Number(value.toPrecision(12)).toString();
}

export async function shortenUrl(rawUrl) {
  let url;
  try { url = new URL(rawUrl); } catch { throw new Error('Enter a complete URL beginning with https:// or http://'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only HTTP and HTTPS links are supported.');
  const endpoint = `https://is.gd/create.php?format=simple&url=${encodeURIComponent(url.toString())}`;
  const response = await safeFetch(endpoint);
  const result = (await response.text()).trim();
  if (!response.ok || !/^https?:\/\//i.test(result)) throw new Error('The URL shortener is unavailable. Try again later.');
  return result;
}

export function qrImageUrl(text) {
  if (!text || text.length > 1800) throw new Error('Provide text or a URL of up to 1,800 characters.');
  return `https://api.qrserver.com/v1/create-qr-code/?size=640x640&format=png&data=${encodeURIComponent(text)}`;
}

export async function weatherFor(place) {
  if (!place || place.length > 100) throw new Error('Usage: /weather Ibadan, Nigeria');
  const geoUrl = new URL(config.weatherGeocodingUrl);
  geoUrl.search = new URLSearchParams({ name: place, count: '1', language: 'en', format: 'json' });
  if (config.weatherApiKey) geoUrl.searchParams.set('apikey', config.weatherApiKey);
  const geocodeUrl = geoUrl.toString();
  const geoResponse = await safeFetch(geocodeUrl);
  if (!geoResponse.ok) throw new Error('The location search service is temporarily unavailable.');
  const geo = await geoResponse.json();
  const location = geo.results?.[0];
  if (!location) throw new Error(`I could not find “${place}”. Try adding its country.`);

  const forecastUrl = new URL(config.weatherForecastUrl);
  forecastUrl.search = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    current: 'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m',
    timezone: 'auto'
  });
  if (config.weatherApiKey) forecastUrl.searchParams.set('apikey', config.weatherApiKey);
  const forecastResponse = await safeFetch(forecastUrl);
  if (!forecastResponse.ok) throw new Error('The weather service is temporarily unavailable.');
  const forecast = await forecastResponse.json();
  const current = forecast.current;
  const descriptions = {
    0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
    45: 'Fog', 48: 'Rime fog', 51: 'Light drizzle', 53: 'Moderate drizzle', 55: 'Dense drizzle',
    61: 'Slight rain', 63: 'Moderate rain', 65: 'Heavy rain', 71: 'Slight snow',
    73: 'Moderate snow', 75: 'Heavy snow', 80: 'Rain showers', 81: 'Moderate rain showers',
    82: 'Violent rain showers', 95: 'Thunderstorm', 96: 'Thunderstorm with hail', 99: 'Heavy thunderstorm with hail'
  };
  return {
    place: [location.name, location.admin1, location.country].filter(Boolean).join(', '),
    temperature: current.temperature_2m,
    feelsLike: current.apparent_temperature,
    humidity: current.relative_humidity_2m,
    wind: current.wind_speed_10m,
    description: descriptions[current.weather_code] || 'Current conditions',
    unit: forecast.current_units?.temperature_2m || '°C',
    time: current.time,
    timezone: forecast.timezone
  };
}

export async function convertCurrency(amountValue, fromValue, toValue) {
  const amount = Number(amountValue);
  const from = String(fromValue || '').toUpperCase();
  const to = String(toValue || '').toUpperCase();
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1e12) throw new Error('Enter a positive amount. Example: /convert 100 USD NGN');
  if (!/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to)) throw new Error('Use three-letter currency codes. Example: /convert 100 USD NGN');
  if (from === to) return { amount, from, to, rate: 1, date: 'same currency' };
  const response = await safeFetch(`https://api.frankfurter.dev/v2/rate/${from.toLowerCase()}/${to.toLowerCase()}`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !Number.isFinite(data.rate)) throw new Error('That currency pair is not available from the exchange-rate source.');
  return { amount, from, to, rate: data.rate, date: data.date, result: amount * data.rate };
}

export function textStats(text) {
  const words = text.trim() ? text.trim().split(/\s+/u).length : 0;
  return { characters: [...text].length, charactersNoSpaces: [...text.replace(/\s/gu, '')].length, words, lines: text ? text.split(/\r\n|\r|\n/).length : 0 };
}

export function createPassword(lengthValue = '18') {
  const length = Number.parseInt(lengthValue, 10);
  if (!Number.isInteger(length) || length < 12 || length > 64) throw new Error('Choose a password length from 12 to 64. Example: /password 20');
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*_-+=';
  const bytes = randomBytes(length);
  let password = '';
  for (let i = 0; i < length; i++) password += alphabet[bytes[i] % alphabet.length];
  return password;
}

export const createUuid = () => randomUUID();
