import 'dotenv/config';
import { config } from '../src/config.js';

const commands = [
  { command: 'start', description: 'Start the bot' },
  { command: 'help', description: 'Show command guide' },
  { command: 'tools', description: 'Browse available tools' },
  { command: 'calc', description: 'Calculate an expression' },
  { command: 'qr', description: 'Generate a QR code' },
  { command: 'shorten', description: 'Shorten a URL' },
  { command: 'weather', description: 'Check current weather' },
  { command: 'convert', description: 'Convert currencies' },
  { command: 'count', description: 'Analyse text statistics' },
  { command: 'password', description: 'Generate a strong password' },
  { command: 'uuid', description: 'Generate a UUID' },
  { command: 'ai', description: 'Ask the AI assistant (Pro)' },
  { command: 'summarize', description: 'Summarise text (Pro)' },
  { command: 'upgrade', description: 'View Pro subscription' },
  { command: 'status', description: 'View account status' },
  { command: 'cancel', description: 'Cancel recurring Pro renewal' },
  { command: 'resume', description: 'Resume recurring Pro renewal' },
  { command: 'terms', description: 'Read terms of service' },
  { command: 'privacy', description: 'Read privacy notice' },
  { command: 'support', description: 'Contact support' },
  { command: 'paysupport', description: 'Get payment support' },
  { command: 'id', description: 'Show your Telegram ID' },
  { command: 'stats', description: 'Admin: show bot usage statistics' },
  { command: 'grant', description: 'Admin: grant Pro access to a user' },
  { command: 'revoke', description: 'Admin: revoke Pro access from a user' },
  { command: 'refund', description: 'Admin: refund the latest Stars payment' }
];

const response = await fetch(`https://api.telegram.org/bot${config.botToken}/setMyCommands`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ commands })
});
const result = await response.json();
if (!response.ok || !result.ok) throw new Error(result.description || `Command setup failed (${response.status})`);
console.log('Bot command menu has been updated.');
