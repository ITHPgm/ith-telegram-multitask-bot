import { config } from '../src/config.js';
import { handleUpdate } from '../src/bot.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  if (!config.webhookSecret) {
    return res.status(503).json({ ok: false, error: 'TELEGRAM_WEBHOOK_SECRET is not configured.' });
  }

  const suppliedSecret = req.headers['x-telegram-bot-api-secret-token'];
  if (typeof suppliedSecret !== 'string' || suppliedSecret !== config.webhookSecret) {
    return res.status(401).json({ ok: false, error: 'Unauthorized webhook request' });
  }

  try {
    const update = req.body && typeof req.body === 'object' ? req.body : {};
    await handleUpdate(update);
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Telegram update handling failed:', error);
    return res.status(500).json({ ok: false, error: 'Update processing failed' });
  }
}
