import { config } from './config.js';

const API_ROOT = `https://api.telegram.org/bot${config.botToken}`;

export async function telegram(method, payload = {}) {
  const response = await fetch(`${API_ROOT}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });

  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error(`Telegram API returned a non-JSON response for ${method}.`);
  }

  if (!response.ok || !result.ok) {
    const description = result?.description || `HTTP ${response.status}`;
    throw new Error(`Telegram ${method} failed: ${description}`);
  }

  return result.result;
}

export const sendMessage = (chatId, text, extra = {}) =>
  telegram('sendMessage', { chat_id: chatId, text, ...extra });

export const answerCallback = (callbackQueryId, text = '') =>
  telegram('answerCallbackQuery', { callback_query_id: callbackQueryId, text });
