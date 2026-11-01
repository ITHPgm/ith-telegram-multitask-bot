import 'dotenv/config';
import { config } from './src/config.js';
import { telegram } from './src/telegram.js';
import { handleUpdate } from './src/bot.js';

if (!config.polling) {
  throw new Error('Local server runs with polling. Set POLLING=true in your .env file.');
}

let offset = 0;
let running = true;

async function poll() {
  while (running) {
    try {
      const updates = await telegram('getUpdates', {
        offset,
        timeout: 25,
        allowed_updates: ['message', 'callback_query', 'pre_checkout_query']
      });
      for (const update of updates) {
        offset = update.update_id + 1;
        try {
          await handleUpdate(update);
        } catch (error) {
          console.error(`Failed to process update ${update.update_id}:`, error);
        }
      }
    } catch (error) {
      console.error('Polling error:', error.message);
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
}

process.on('SIGINT', () => { running = false; process.exit(0); });
process.on('SIGTERM', () => { running = false; process.exit(0); });

console.log('Telegram bot started in long-polling mode. Press Ctrl+C to stop.');
await poll();
