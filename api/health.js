import { config } from '../src/config.js';
import { storageMode } from '../src/store.js';

export default async function handler(_req, res) {
  return res.status(200).json({
    ok: true,
    service: 'telegram-multitask-bot',
    webhookConfigured: Boolean(config.webhookSecret),
    aiConfigured: Boolean(config.openAiKey),
    storage: storageMode,
    timestamp: new Date().toISOString()
  });
}
