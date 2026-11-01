import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from './config.js';
import { telegram, sendMessage, answerCallback } from './telegram.js';
import { getUser, saveUser, getUsers, incrementUsage, recordPayment, storageMode } from './store.js';
import {
  calculate, shortenUrl, qrImageUrl, weatherFor, convertCurrency,
  textStats, createPassword, createUuid
} from './features/tools.js';
import { askAi } from './features/ai.js';

const DAY = 24 * 60 * 60 * 1000;
const MONTH = 30 * DAY;
const PAYMENT_PERIOD_SECONDS = 2592000;

const toolsKeyboard = {
  inline_keyboard: [
    [{ text: 'Calculator', callback_data: 'tool:calc' }, { text: 'Weather', callback_data: 'tool:weather' }],
    [{ text: 'Currency', callback_data: 'tool:convert' }, { text: 'QR Code', callback_data: 'tool:qr' }],
    [{ text: 'URL Shortener', callback_data: 'tool:shorten' }, { text: 'Text Stats', callback_data: 'tool:count' }],
    [{ text: 'Password', callback_data: 'tool:password' }, { text: 'UUID', callback_data: 'tool:uuid' }],
    [{ text: 'AI Assistant (Pro)', callback_data: 'tool:ai' }, { text: 'Upgrade', callback_data: 'menu:plan' }]
  ]
};

function todayBucket() {
  return new Date().toISOString().slice(0, 10).replaceAll('-', '');
}

function activePro(user) {
  return Boolean(user?.proUntil && new Date(user.proUntil).getTime() > Date.now());
}

function isAdmin(userId) {
  return config.adminIds.has(String(userId));
}

async function touchUser(from) {
  const previous = await getUser(from.id) || {};
  return saveUser(from.id, {
    firstName: from.first_name || previous.firstName || '',
    lastName: from.last_name || previous.lastName || '',
    username: from.username || previous.username || '',
    createdAt: previous.createdAt || new Date().toISOString(),
    lastSeenAt: new Date().toISOString()
  });
}

async function sendToolHelp(chatId, toolName) {
  const help = {
    calc: 'Send an expression after /calc. Example: /calc (25 + 15) * 2',
    weather: 'Send a location after /weather. Example: /weather Ibadan, Nigeria',
    convert: 'Use /convert amount FROM TO. Example: /convert 100 USD NGN',
    qr: 'Use /qr followed by text or a URL. Example: /qr https://example.com',
    shorten: 'Use /shorten followed by a complete URL. Example: /shorten https://example.com/page',
    count: 'Use /count followed by the text to analyse. Example: /count Count these words',
    password: 'Use /password followed by a length from 12 to 64. Example: /password 20',
    uuid: 'Use /uuid to generate a random UUID.',
    ai: 'Use /ai followed by a question. Example: /ai Explain REST APIs with an example.'
  };
  await sendMessage(chatId, help[toolName] || 'Choose a tool from /tools.');
}

async function enforceFreeLimit(chatId, user, feature = 'tool') {
  if (activePro(user)) return true;
  const limit = config.freeDailyLimit;
  const used = await incrementUsage(user.id, `${feature}:${todayBucket()}`);
  if (used > limit) {
    await sendMessage(chatId, `You have used your ${limit} free ${feature} actions for today. Your allowance resets at 00:00 UTC. Use /upgrade to unlock Pro access.`);
    return false;
  }
  return true;
}

async function enforceProAiLimit(chatId, user) {
  if (!activePro(user)) {
    await sendMessage(chatId, 'The AI assistant is part of Pro. Use /upgrade to view the monthly subscription.');
    return false;
  }
  const used = await incrementUsage(user.id, `ai:${todayBucket()}`);
  if (used > config.proAiDailyLimit) {
    await sendMessage(chatId, `You have reached the Pro AI allowance of ${config.proAiDailyLimit} requests for today. It resets at 00:00 UTC.`);
    return false;
  }
  return true;
}

function createPaymentPayload(userId) {
  const signature = createHmac('sha256', config.appSecret)
    .update(`pro-monthly:${userId}`)
    .digest('hex')
    .slice(0, 20);
  return `pro_monthly_${userId}_${signature}`;
}

function validPaymentPayload(payload, userId) {
  const expected = createPaymentPayload(userId);
  const givenBuffer = Buffer.from(String(payload || ''));
  const expectedBuffer = Buffer.from(expected);
  return givenBuffer.length === expectedBuffer.length && timingSafeEqual(givenBuffer, expectedBuffer);
}

async function issueProInvoice(chatId, userId) {
  const payload = createPaymentPayload(userId);
  await telegram('sendInvoice', {
    chat_id: chatId,
    title: 'Pro Monthly Access',
    description: 'Unlock the AI assistant and higher usage limits for 30 days. Renews monthly until cancelled in Telegram.',
    payload,
    provider_token: '',
    currency: 'XTR',
    prices: [{ label: 'Pro monthly access', amount: config.monthlyStars }],
    subscription_period: PAYMENT_PERIOD_SECONDS
  });
}

async function showUpgrade(chatId, user) {
  const pro = activePro(user);
  if (pro) {
    await sendMessage(chatId, `Your Pro access is active until ${new Date(user.proUntil).toUTCString()}. Use /status for your account details.`);
    return;
  }
  await sendMessage(chatId,
    `PRO MEMBERSHIP\n\n` +
    `• AI assistant and text summarisation\n` +
    `• Higher daily usage limits\n` +
    `• 30-day recurring subscription\n\n` +
    `Price: ${config.monthlyStars} Telegram Stars every 30 days.\n\n` +
    `Before checkout, read /terms and confirm that you agree. Digital services are paid for with Telegram Stars.`,
    { reply_markup: { inline_keyboard: [[{ text: 'I agree to the Terms — Continue', callback_data: 'terms:accept' }]] } }
  );
}

async function showStatus(chatId, user) {
  const pro = activePro(user);
  const used = pro ? 'Pro' : 'Free';
  const expiry = pro ? new Date(user.proUntil).toUTCString() : 'No active Pro subscription';
  await sendMessage(chatId,
    `ACCOUNT STATUS\n\n` +
    `Telegram ID: ${user.id}\n` +
    `Plan: ${used}\n` +
    `Pro expiry: ${expiry}\n` +
    `Free daily allowance: ${config.freeDailyLimit} tool actions\n` +
    `Pro AI allowance: ${config.proAiDailyLimit} requests per day\n\n` +
    `Use /upgrade to manage your plan. Recurring billing can be cancelled from the Telegram payment/subscription controls.`
  );
}

async function processPayment(message) {
  const userId = message.from.id;
  const payment = message.successful_payment;
  if (payment.currency !== 'XTR' || !validPaymentPayload(payment.invoice_payload, userId)) {
    await sendMessage(message.chat.id, 'The payment details could not be verified. Please contact /paysupport before retrying.');
    return;
  }
  if (!Number.isInteger(payment.total_amount) || payment.total_amount < 1 || payment.total_amount > 10000) {
    await sendMessage(message.chat.id, 'The payment amount is outside the supported range. Please contact /paysupport.');
    return;
  }

  const chargeId = payment.telegram_payment_charge_id;
  const firstRecord = await recordPayment(chargeId, {
    userId: String(userId),
    amount: payment.total_amount,
    currency: payment.currency,
    paidAt: new Date().toISOString(),
    payload: payment.invoice_payload
  });
  if (!firstRecord) {
    await sendMessage(message.chat.id, 'This payment has already been recorded. Your subscription status is unchanged.');
    return;
  }

  const currentUser = await getUser(userId) || { id: String(userId) };
  const telegramExpiry = payment.subscription_expiration_date
    ? new Date(payment.subscription_expiration_date * 1000)
    : new Date(Date.now() + MONTH);
  const currentExpiry = currentUser.proUntil ? new Date(currentUser.proUntil) : new Date(0);
  const proUntil = new Date(Math.max(telegramExpiry.getTime(), currentExpiry.getTime())).toISOString();
  const charges = Array.isArray(currentUser.paymentCharges) ? currentUser.paymentCharges : [];
  charges.unshift({ chargeId, amount: payment.total_amount, paidAt: new Date().toISOString() });
  await saveUser(userId, {
    proUntil,
    paymentCharges: charges.slice(0, 10),
    lastPaymentAt: new Date().toISOString(),
    acceptedTermsAt: currentUser.acceptedTermsAt || new Date().toISOString()
  });

  await sendMessage(message.chat.id,
    `Payment received. Pro access is now active until ${new Date(proUntil).toUTCString()}.\n\n` +
    `Use /ai to try the AI assistant or /tools to view all tools. Save your receipt and use /paysupport for payment assistance.`
  );
}

async function handlePreCheckout(query) {
  const userId = query.from.id;
  const valid = query.invoice_payload &&
    validPaymentPayload(query.invoice_payload, userId) &&
    query.currency === 'XTR' &&
    Number.isInteger(query.total_amount) && query.total_amount > 0 && query.total_amount <= 10000;
  await telegram('answerPreCheckoutQuery', {
    pre_checkout_query_id: query.id,
    ok: Boolean(valid),
    ...(!valid ? { error_message: 'This invoice is invalid or no longer matches the current plan. Please open /upgrade again.' } : {})
  });
}

async function handleCallback(query) {
  const chatId = query.message?.chat?.id;
  const userId = query.from?.id;
  if (!chatId || !userId) {
    await answerCallback(query.id, 'This action is unavailable.');
    return;
  }
  const user = await touchUser(query.from);
  const data = query.data || '';
  if (data === 'menu:tools') {
    await answerCallback(query.id);
    await sendMessage(chatId, 'Choose a tool or use its command directly:', { reply_markup: toolsKeyboard });
    return;
  }
  if (data === 'menu:plan') {
    await answerCallback(query.id);
    await showUpgrade(chatId, user);
    return;
  }
  if (data.startsWith('tool:')) {
    await answerCallback(query.id);
    await sendToolHelp(chatId, data.slice(5));
    return;
  }
  if (data === 'terms:accept') {
    if (query.message.chat.type !== 'private') {
      await answerCallback(query.id, 'Open the bot in a private chat to subscribe.');
      return;
    }
    await saveUser(userId, { acceptedTermsAt: new Date().toISOString() });
    await answerCallback(query.id, 'Opening secure Telegram checkout.');
    try {
      await issueProInvoice(chatId, userId);
    } catch (error) {
      console.error('Invoice creation failed:', error);
      await sendMessage(chatId, 'Checkout could not be created. Please try /upgrade again later.');
    }
    return;
  }
  await answerCallback(query.id, 'Unknown action.');
}

async function handleCommand(message, user) {
  const chatId = message.chat.id;
  const rawText = message.text || '';
  const [rawCommand = '', ...args] = rawText.trim().split(/\s+/u);
  const command = rawCommand.split('@')[0].slice(1).toLowerCase();
  const input = args.join(' ').trim();

  switch (command) {
    case 'start':
      await sendMessage(chatId,
        `Welcome to MultiTask Bot, ${user.firstName || 'there'}.\n\n` +
        `A collection of practical tools in one Telegram chat. Use /tools to browse features or /help to see commands.\n\n` +
        `Free users receive ${config.freeDailyLimit} tool actions each day. Pro adds AI tools and higher limits.`,
        { reply_markup: { inline_keyboard: [[{ text: 'Open Tool Menu', callback_data: 'menu:tools' }], [{ text: 'View Pro Plan', callback_data: 'menu:plan' }]] } }
      );
      break;
    case 'help':
      await sendMessage(chatId,
        `COMMAND GUIDE\n\n` +
        `/tools — Browse all tools\n` +
        `/calc expression — Calculator\n` +
        `/qr text — Create a QR code\n` +
        `/shorten URL — Shorten a link\n` +
        `/weather city — Current weather\n` +
        `/convert amount FROM TO — Currency conversion\n` +
        `/count text — Text statistics\n` +
        `/password [length] — Generate a password\n` +
        `/uuid — Generate a UUID\n` +
        `/ai prompt — AI assistant (Pro)\n` +
        `/summarize text — AI summary (Pro)\n` +
        `/upgrade — View subscription\n` +
        `/status — Account status\n` +
        `/cancel — Cancel recurring renewal\n` +
        `/resume — Re-enable recurring renewal\n` +
        `/terms — Terms of service\n` +
        `/privacy — Privacy notice\n` +
        `/support — Support contact`
      );
      break;
    case 'tools':
    case 'menu':
      await sendMessage(chatId, 'Choose a tool or use its command directly:', { reply_markup: toolsKeyboard });
      break;
    case 'id':
      await sendMessage(chatId, `Your Telegram user ID: ${user.id}\nChat ID: ${chatId}`);
      break;
    case 'ping':
      await sendMessage(chatId, 'Pong. The bot is responding.');
      break;
    case 'calc': {
      if (!await enforceFreeLimit(chatId, user)) break;
      try { await sendMessage(chatId, `Result: ${calculate(input)}`); }
      catch (error) { await sendMessage(chatId, error.message); }
      break;
    }
    case 'shorten': {
      if (!await enforceFreeLimit(chatId, user)) break;
      try { await sendMessage(chatId, `Shortened link:\n${await shortenUrl(input)}`); }
      catch (error) { await sendMessage(chatId, error.message); }
      break;
    }
    case 'qr': {
      if (!await enforceFreeLimit(chatId, user)) break;
      try {
        const photo = qrImageUrl(input);
        await telegram('sendPhoto', {
          chat_id: chatId,
          photo,
          caption: 'QR code generated. Do not encode passwords, private keys, or other secrets using a third-party QR service.'
        });
      } catch (error) { await sendMessage(chatId, error.message); }
      break;
    }
    case 'weather': {
      if (!await enforceFreeLimit(chatId, user)) break;
      try {
        const w = await weatherFor(input);
        await sendMessage(chatId,
          `WEATHER — ${w.place}\n\n` +
          `${w.description}\n` +
          `Temperature: ${w.temperature}${w.unit}\n` +
          `Feels like: ${w.feelsLike}${w.unit}\n` +
          `Humidity: ${w.humidity}%\n` +
          `Wind: ${w.wind} km/h\n` +
          `Local time: ${w.time} (${w.timezone})\n\n` +
          `Weather data: https://open-meteo.com/ (CC BY 4.0)\n` +
          `Location data: GeoNames`
        );
      } catch (error) { await sendMessage(chatId, error.message); }
      break;
    }
    case 'convert': {
      if (!await enforceFreeLimit(chatId, user)) break;
      const parts = args;
      if (parts.length !== 3) { await sendMessage(chatId, 'Usage: /convert amount FROM TO\nExample: /convert 100 USD NGN'); break; }
      try {
        const result = await convertCurrency(parts[0], parts[1], parts[2]);
        await sendMessage(chatId,
          `${result.amount.toLocaleString('en-US')} ${result.from} = ${result.result === undefined ? result.amount.toLocaleString('en-US') : result.result.toLocaleString('en-US', { maximumFractionDigits: 4 })} ${result.to}\n` +
          `Rate: 1 ${result.from} = ${result.rate} ${result.to}\n` +
          `Rate date: ${result.date}\n\n` +
          `Source: Frankfurter. Rates are indicative, not a payment quote.`
        );
      } catch (error) { await sendMessage(chatId, error.message); }
      break;
    }
    case 'count': {
      if (!await enforceFreeLimit(chatId, user)) break;
      if (!input) { await sendMessage(chatId, 'Usage: /count paste your text here'); break; }
      const stats = textStats(input);
      await sendMessage(chatId,
        `TEXT STATISTICS\n\nWords: ${stats.words}\nCharacters: ${stats.characters}\nCharacters without spaces: ${stats.charactersNoSpaces}\nLines: ${stats.lines}`
      );
      break;
    }
    case 'password': {
      if (!await enforceFreeLimit(chatId, user)) break;
      try {
        await sendMessage(chatId, `Generated password (${args[0] || 18} characters):\n${createPassword(args[0] || '18')}\n\nFor sensitive accounts, consider using a dedicated password manager and avoid sharing this chat.`);
      } catch (error) { await sendMessage(chatId, error.message); }
      break;
    }
    case 'uuid':
      if (!await enforceFreeLimit(chatId, user)) break;
      await sendMessage(chatId, `UUID v4:\n${createUuid()}`);
      break;
    case 'ai':
    case 'summarize': {
      if (!await enforceProAiLimit(chatId, user)) break;
      if (!input) { await sendMessage(chatId, command === 'ai' ? 'Usage: /ai ask a question' : 'Usage: /summarize paste text to summarise'); break; }
      await sendMessage(chatId, 'Working on it…');
      try {
        const answer = await askAi(input, command === 'summarize' ? 'summarize' : 'answer');
        await sendMessage(chatId, answer);
      } catch (error) { await sendMessage(chatId, `AI request failed: ${error.message}`); }
      break;
    }
    case 'upgrade':
    case 'plan':
      await showUpgrade(chatId, user);
      break;
    case 'status':
      await showStatus(chatId, user);
      break;
    case 'cancel':
    case 'resume': {
      const latestCharge = user.paymentCharges?.[0]?.chargeId;
      if (!latestCharge) { await sendMessage(chatId, 'No recorded Stars subscription payment was found for this account. Contact /paysupport for assistance.'); break; }
      try {
        await telegram('editUserStarSubscription', {
          user_id: Number(user.id),
          telegram_payment_charge_id: latestCharge,
          is_canceled: command === 'cancel'
        });
        await sendMessage(chatId, command === 'cancel'
          ? `Automatic renewal has been cancelled. Your current Pro access remains available until ${user.proUntil ? new Date(user.proUntil).toUTCString() : 'the end of the paid period'}.`
          : 'Automatic renewal has been re-enabled for your Telegram Stars subscription.');
      } catch (error) {
        await sendMessage(chatId, `Telegram could not update the subscription: ${error.message}. Use /paysupport for help.`);
      }
      break;
    }
    case 'terms':
      await sendMessage(chatId,
        `TERMS OF SERVICE\n\n` +
        `1. Use the bot lawfully and do not abuse, disrupt, or attempt to bypass its usage limits.\n` +
        `2. Tool outputs are provided for general information. Verify important results independently. Weather and exchange-rate data may be delayed or incomplete.\n` +
        `3. AI output can be inaccurate. Do not rely on it as professional, legal, medical, or financial advice.\n` +
        `4. Pro is a digital service billed in Telegram Stars. The monthly plan renews every 30 days until cancelled with /cancel or through Telegram's subscription controls.\n` +
        `5. Refund and payment questions should be sent through /paysupport.\n` +
        `6. Your Telegram user ID and basic account details are stored to provide bot access, enforce limits, and record payments. Do not submit highly sensitive information.\n` +
        `7. The service may be changed or paused for maintenance.\n\n` +
        `By purchasing Pro, you confirm that you have read and accepted these terms. Use /support for assistance.`
      );
      break;
    case 'privacy':
      await sendMessage(chatId,
        `PRIVACY NOTICE\n\n` +
        `The bot stores your Telegram user ID, display name, username, usage counters, subscription expiry, and payment charge references. This data is used to operate the bot, apply usage limits, provide paid access, and handle support.\n\n` +
        `When you use a feature, the relevant input may be sent to its third-party provider: AI prompts to OpenAI, weather searches to the configured weather provider, links to the URL shortener, and QR content to the QR image service. Currency requests are sent to Frankfurter.\n\n` +
        `Do not submit passwords, payment card details, private keys, medical records, or other sensitive information. Contact ${config.supportContact} to request access or deletion of account data. Some payment records may need to be retained for accounting, fraud prevention, and dispute handling.\n\n` +
        `This notice is a starter template. Replace it with a complete privacy policy that identifies the actual operator, retention periods, service providers, user rights, and applicable legal basis before public launch.`
      );
      break;
    case 'support':
    case 'paysupport':
      await sendMessage(chatId,
        `SUPPORT\n\nContact: ${config.supportContact}\n\n` +
        `For payment issues, include your Telegram user ID (/id), the date of payment, and the Telegram receipt or charge details. Do not share your bot token or account passwords. Telegram support cannot resolve purchases made through this bot; contact the bot operator directly.`
      );
      break;
    case 'stats': {
      if (!isAdmin(user.id)) { await sendMessage(chatId, 'This command is for bot administrators.'); break; }
      const users = await getUsers();
      const paid = users.filter(activePro).length;
      await sendMessage(chatId, `ADMIN STATS\n\nUsers: ${users.length}\nActive Pro users: ${paid}\nStorage: ${storageMode}\nAI configured: ${config.openAiKey ? 'Yes' : 'No'}`);
      break;
    }
    case 'grant': {
      if (!isAdmin(user.id)) { await sendMessage(chatId, 'This command is for bot administrators.'); break; }
      const [target, daysText = '30'] = args;
      const days = Number.parseInt(daysText, 10);
      if (!/^\d+$/.test(target || '') || !Number.isInteger(days) || days < 1 || days > 3650) { await sendMessage(chatId, 'Usage: /grant TELEGRAM_USER_ID [days]'); break; }
      const current = await getUser(target) || { id: target };
      const end = new Date(Math.max(Date.now(), current.proUntil ? new Date(current.proUntil).getTime() : 0) + days * DAY);
      await saveUser(target, { proUntil: end.toISOString(), manuallyGranted: true });
      await sendMessage(chatId, `Pro access granted to ${target} until ${end.toUTCString()}.`);
      break;
    }
    case 'revoke': {
      if (!isAdmin(user.id)) { await sendMessage(chatId, 'This command is for bot administrators.'); break; }
      const target = args[0];
      if (!/^\d+$/.test(target || '')) { await sendMessage(chatId, 'Usage: /revoke TELEGRAM_USER_ID'); break; }
      const targetUser = await getUser(target);
      const latestCharge = targetUser?.paymentCharges?.[0]?.chargeId;
      if (latestCharge) {
        try { await telegram('editUserStarSubscription', { user_id: Number(target), telegram_payment_charge_id: latestCharge, is_canceled: true }); }
        catch (error) { console.warn('Could not cancel automatic renewal during revoke:', error.message); }
      }
      await saveUser(target, { proUntil: null, manuallyGranted: false });
      await sendMessage(chatId, `Pro access revoked for ${target}. Any recorded recurring subscription was also submitted for cancellation.`);
      break;
    }
    case 'refund': {
      if (!isAdmin(user.id)) { await sendMessage(chatId, 'This command is for bot administrators.'); break; }
      const target = args[0];
      if (!/^\d+$/.test(target || '')) { await sendMessage(chatId, 'Usage: /refund TELEGRAM_USER_ID'); break; }
      const targetUser = await getUser(target);
      const latestCharge = targetUser?.paymentCharges?.[0]?.chargeId;
      if (!latestCharge) { await sendMessage(chatId, 'No stored Stars payment charge was found for that user.'); break; }
      try {
        try {
          await telegram('editUserStarSubscription', { user_id: Number(target), telegram_payment_charge_id: latestCharge, is_canceled: true });
        } catch (cancelError) {
          console.warn('Could not cancel future renewal before refund:', cancelError.message);
        }
        await telegram('refundStarPayment', { user_id: Number(target), telegram_payment_charge_id: latestCharge });
        await saveUser(target, { proUntil: null, manuallyGranted: false, lastRefundAt: new Date().toISOString() });
        await sendMessage(chatId, `The latest recorded Stars payment for ${target} was refunded and Pro access was revoked.`);
        try { await sendMessage(Number(target), 'Your latest Pro payment has been refunded and Pro access has been revoked. Contact support if you need assistance.'); } catch {}
      } catch (error) {
        await sendMessage(chatId, `Refund failed: ${error.message}`);
      }
      break;
    }
    default:
      await sendMessage(chatId, 'I do not recognise that command. Use /help to see available commands.');
  }
}

export async function handleUpdate(update) {
  if (update.pre_checkout_query) {
    await handlePreCheckout(update.pre_checkout_query);
    return;
  }

  if (update.callback_query) {
    await handleCallback(update.callback_query);
    return;
  }

  const message = update.message;
  if (!message) return;
  if (message.successful_payment) {
    await processPayment(message);
    return;
  }
  if (!message.text || !message.text.startsWith('/')) return;
  if (message.chat?.type !== 'private') {
    await sendMessage(message.chat.id, 'Please open this bot in a private chat to use its tools and subscription features.');
    return;
  }

  const user = await touchUser(message.from);
  await handleCommand(message, user);
}
