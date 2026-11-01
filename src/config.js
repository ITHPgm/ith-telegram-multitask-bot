const required = ['TELEGRAM_BOT_TOKEN'];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

const parsedPrice = Number.parseInt(process.env.PRO_MONTHLY_STARS || '299', 10);

if (!Number.isInteger(parsedPrice) || parsedPrice < 1 || parsedPrice > 10000) {
  throw new Error('PRO_MONTHLY_STARS must be an integer between 1 and 10000.');
}

export const config = Object.freeze({
  botToken: process.env.TELEGRAM_BOT_TOKEN,
  webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET || '',
  appSecret: process.env.APP_SECRET || process.env.TELEGRAM_BOT_TOKEN,
  appUrl: (process.env.APP_URL || '').replace(/\/$/, ''),
  polling: String(process.env.POLLING || 'false').toLowerCase() === 'true',
  adminIds: new Set((process.env.ADMIN_IDS || '').split(',').map(v => v.trim()).filter(Boolean)),
  openAiKey: process.env.OPENAI_API_KEY || '',
  openAiModel: process.env.OPENAI_MODEL || 'gpt-5-mini',
  monthlyStars: parsedPrice,
  supportContact: process.env.SUPPORT_CONTACT || 'Please configure SUPPORT_CONTACT.',
  freeDailyLimit: Math.max(1, Number.parseInt(process.env.FREE_DAILY_LIMIT || '25', 10)),
  proAiDailyLimit: Math.max(1, Number.parseInt(process.env.PRO_AI_DAILY_LIMIT || '60', 10)),
  redisUrl: process.env.UPSTASH_REDIS_REST_URL || '',
  redisToken: process.env.UPSTASH_REDIS_REST_TOKEN || '',
  weatherGeocodingUrl: process.env.WEATHER_GEOCODING_URL || 'https://geocoding-api.open-meteo.com/v1/search',
  weatherForecastUrl: process.env.WEATHER_FORECAST_URL || 'https://api.open-meteo.com/v1/forecast',
  weatherApiKey: process.env.WEATHER_API_KEY || ''
});
