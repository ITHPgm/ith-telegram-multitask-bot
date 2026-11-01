import 'dotenv/config';
import { config } from '../src/config.js';

const response = await fetch(`https://api.telegram.org/bot${config.botToken}/deleteWebhook`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ drop_pending_updates: false })
});
const result = await response.json();
if (!response.ok || !result.ok) throw new Error(result.description || `Webhook removal failed (${response.status})`);
console.log('Telegram webhook removed. Local long polling can now be used.');
