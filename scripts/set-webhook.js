import 'dotenv/config';
import { config } from '../src/config.js';

if (!config.appUrl) throw new Error('Set APP_URL to your deployed HTTPS Vercel URL.');
if (!config.webhookSecret) throw new Error('Set TELEGRAM_WEBHOOK_SECRET before registering the webhook.');

const webhookUrl = `${config.appUrl}/api/webhook`;
const response = await fetch(`https://api.telegram.org/bot${config.botToken}/setWebhook`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    url: webhookUrl,
    secret_token: config.webhookSecret,
    allowed_updates: ['message', 'callback_query', 'pre_checkout_query'],
    drop_pending_updates: false
  })
});
const result = await response.json();
if (!response.ok || !result.ok) throw new Error(result.description || `Webhook setup failed (${response.status})`);
console.log(`Webhook registered: ${webhookUrl}`);
