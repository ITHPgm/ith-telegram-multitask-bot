<<<<<<< HEAD
# Telegram MultiTask Bot

A modular Telegram bot that brings practical utilities into one chat. It uses the official Telegram Bot API, supports local long polling and Vercel webhooks, and includes an optional paid Pro tier using recurring Telegram Stars subscriptions.

This repository implements common utility-bot patterns independently. It does not copy another bot's source code, name, artwork, or proprietary implementation. Add integrations only when you have the necessary API rights and commercial licences.

## Features

### Free tools

| Command | What it does |
| --- | --- |
| `/calc 15 * (4 + 2)` | Evaluates a basic arithmetic expression |
| `/qr https://example.com` | Generates a QR code |
| `/shorten https://example.com/page` | Shortens an HTTP or HTTPS URL |
| `/weather Ibadan, Nigeria` | Gets current weather for a location |
| `/convert 100 USD NGN` | Converts currencies using the latest available reference rate |
| `/count your text here` | Counts words, characters, and lines |
| `/password 20` | Generates a random password of 12–64 characters |
| `/uuid` | Generates a UUID v4 |
| `/privacy` | Displays the starter privacy notice |
| `/id` | Displays your Telegram user and chat IDs |

### Pro tools

| Command | What it does |
| --- | --- |
| `/ai Explain REST APIs` | AI assistant powered by the OpenAI API |
| `/summarize paste your text` | Summarises supplied text |

Pro also bypasses the free utility quota. AI usage has a separate daily limit controlled by environment variables. Subscribers can use `/cancel` and `/resume` to manage recurring renewals.

### Administration

- `/stats` — total registered users and active Pro users.
- `/grant TELEGRAM_USER_ID [days]` — manually grant Pro access.
- `/revoke TELEGRAM_USER_ID` — revoke Pro access.
- `/refund TELEGRAM_USER_ID` — cancel renewal and refund the user's latest recorded Stars payment.

Admin commands require the user's numeric Telegram ID to be listed in `ADMIN_IDS`.

## Requirements

- Node.js 20 or newer.
- A Telegram bot token from [@BotFather](https://t.me/BotFather).
- An Upstash Redis database for persistent production storage.
- An OpenAI API key only when you want to enable AI features.
- A public HTTPS host for webhook deployment, or a computer/server that remains online for long polling.

## 1. Create your Telegram bot

1. Open Telegram and start a conversation with [@BotFather](https://t.me/BotFather).
2. Send `/newbot` and follow the prompts.
3. Copy the token BotFather provides.
4. Keep the token private. Anyone with it can control your bot.
5. Start your new bot once from your Telegram account so the bot can message you.

## 2. Install the project locally

Download or clone the repository, then open the project directory in your terminal:

```bash
git clone https://github.com/YOUR-USERNAME/telegram-multitask-bot.git
cd telegram-multitask-bot
npm install
```

Copy `.env.example` to `.env`.

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

macOS / Linux:

```bash
cp .env.example .env
```

Open `.env` and set at least:

```env
TELEGRAM_BOT_TOKEN=your_real_botfather_token
TELEGRAM_WEBHOOK_SECRET=generate_a_long_random_secret
APP_SECRET=generate_a_different_long_random_secret
POLLING=true
ADMIN_IDS=your_numeric_telegram_user_id
```

Generate a secure secret in PowerShell:

```powershell
[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(48))
```

Generate a secret with Node.js:

```bash
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
```

Use different values for `TELEGRAM_WEBHOOK_SECRET` and `APP_SECRET`. Do not commit `.env` to GitHub.

## 3. Run locally with long polling

Set `POLLING=true` in `.env`, then run:

```bash
npm start
```

Open your bot in Telegram and send `/start`.

Long polling and webhooks cannot be used at the same time for the same bot. Before switching to local polling, remove the webhook using the project script:

```bash
npm run delete:webhook
```

## 4. Configure persistent storage with Upstash Redis

The project uses a local JSON file when Redis credentials are absent. This is suitable for local testing only. Vercel functions use ephemeral serverless instances, so local JSON storage is not durable and must not be used for production payment records or subscription access.

For production:

1. Create a Redis database at [Upstash](https://upstash.com/).
2. Open the database details and copy the REST URL and REST token.
3. Add them to `.env` locally or to Vercel Environment Variables:

```env
UPSTASH_REDIS_REST_URL=https://your-database.upstash.io
UPSTASH_REDIS_REST_TOKEN=your_upstash_rest_token
```

The application switches to Upstash automatically when both values are present. Use the same Redis database across Production, Preview, and Development only where that separation is intentional.

## 5. Optional: enable the AI assistant

Create an API key from your OpenAI developer account and set:

```env
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-5-mini
```

The model name is configurable. Use a model enabled for your API account. AI commands are restricted to active Pro subscribers by default.

Never expose the OpenAI key to users or place it in frontend code.

## 6. Set up paid Pro access with Telegram Stars

The built-in Pro plan creates a 30-day recurring subscription invoice using Telegram Stars (`XTR`). The default amount is 299 Stars. Change it with:

```env
PRO_MONTHLY_STARS=299
```

Telegram currently requires the subscription period to be 2,592,000 seconds (30 days), and the subscription invoice amount must be within Telegram's documented Stars limit. The app validates the configured price at startup.

How checkout works:

1. User sends `/upgrade`.
2. User reads `/terms` and taps the acceptance button.
3. The bot creates a recurring Stars invoice.
4. The bot validates the `pre_checkout_query`.
5. Pro access is granted only after a `successful_payment` update is received and verified.
6. The Telegram charge ID is stored to support payment records and future refund handling.

Test Stars payments using Telegram's dedicated test environment before enabling live payments. Configure a clear support contact:

```env
SUPPORT_CONTACT=@YourSupportAccount
```

The `/cancel` stops future renewals, `/resume` re-enables renewal, and `/paysupport` explains how users can reach the operator. Review Telegram's current payment terms and your own refund, privacy, and consumer-law obligations before selling access. Do not advertise a price or feature set that you have not actually enabled.

## 7. Deploy to Vercel with webhooks

### A. Push the repository to GitHub

Create an empty GitHub repository, then push this project:

```bash
git init
git add .
git commit -m "Initial Telegram MultiTask Bot"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/telegram-multitask-bot.git
git push -u origin main
```

### B. Import into Vercel

1. Sign in to [Vercel](https://vercel.com/).
2. Add a New Project and import the GitHub repository.
3. Keep the project root at the repository root.
4. Add the environment variables below in Project Settings → Environment Variables.
5. Deploy the project.

Required production variables:

```env
TELEGRAM_BOT_TOKEN=your_botfather_token
TELEGRAM_WEBHOOK_SECRET=long_random_secret
APP_SECRET=another_long_random_secret
APP_URL=https://your-project.vercel.app
POLLING=false
ADMIN_IDS=your_numeric_telegram_user_id
UPSTASH_REDIS_REST_URL=https://your-database.upstash.io
UPSTASH_REDIS_REST_TOKEN=your_upstash_rest_token
```

Add `OPENAI_API_KEY`, `OPENAI_MODEL`, `PRO_MONTHLY_STARS`, and `SUPPORT_CONTACT` when needed.

### C. Register the webhook

After the first successful deployment, install dependencies locally and set `APP_URL` in your `.env` to the deployed Vercel URL. Then run:

```bash
npm run set:webhook
```

The script registers `https://your-project.vercel.app/api/webhook` and configures Telegram to send a secret header. The Vercel endpoint rejects requests without the matching `X-Telegram-Bot-Api-Secret-Token` header.

Register the bot's command menu:

```bash
npm run set:commands
```

### D. Check deployment health

Open:

```text
https://your-project.vercel.app/api/health
```

The response reports whether webhook security and AI are configured and which storage adapter is active. Confirm that production storage reports `upstash-redis` before accepting real payments.

## Environment variables reference

| Variable | Required | Description |
| --- | --- | --- |
| `TELEGRAM_BOT_TOKEN` | Yes | Token from BotFather |
| `TELEGRAM_WEBHOOK_SECRET` | For Vercel | Secret Telegram sends in webhook headers |
| `APP_SECRET` | Recommended | Signs payment payloads |
| `APP_URL` | For webhook setup | Public Vercel HTTPS URL |
| `POLLING` | Local mode | `true` for local polling; `false` for webhook deployment |
| `ADMIN_IDS` | Recommended | Comma-separated admin Telegram IDs |
| `UPSTASH_REDIS_REST_URL` | Production | Upstash REST URL |
| `UPSTASH_REDIS_REST_TOKEN` | Production | Upstash REST token |
| `OPENAI_API_KEY` | Optional | Enables AI commands |
| `OPENAI_MODEL` | Optional | OpenAI model name |
| `PRO_MONTHLY_STARS` | Optional | Monthly Stars price, default 299 |
| `SUPPORT_CONTACT` | For paid launch | Contact displayed for payment support |
| `FREE_DAILY_LIMIT` | Optional | Daily free tool actions, default 25 |
| `PRO_AI_DAILY_LIMIT` | Optional | Daily Pro AI requests, default 60 |
| `WEATHER_GEOCODING_URL` | Optional | Weather geocoding API endpoint |
| `WEATHER_FORECAST_URL` | Optional | Weather forecast API endpoint |
| `WEATHER_API_KEY` | Provider-dependent | Commercial weather API key, if required |

## Commercial API and third-party service notes

- **Weather:** the default Open-Meteo public endpoints are for non-commercial use. Because this bot is intended to be monetised, obtain the appropriate commercial API licence and configure the customer endpoints/key, or replace the weather adapter with a provider whose licence covers your use. Open-Meteo attribution must be retained when using its data.
- **Currency:** exchange-rate data comes from Frankfurter. Rates are indicative and may not be suitable for billing, trading, or financial decisions. Check provider terms before high-volume or commercial resale.
- **URL shortening:** the implementation sends the submitted URL to the public is.gd service. Do not send private URLs. Replace this adapter with your own domain and shortening service for production branding and control.
- **QR generation:** the URL or text is passed to an external QR image service. Do not encode confidential information. Replace the adapter with a locally generated QR library if you need data to remain on your infrastructure.
- **AI:** prompts are sent to the configured OpenAI API account and are subject to its terms and data controls. Tell customers how their content is processed in your privacy notice.

## Project structure

```text
telegram-multitask-bot/
├── api/
│   ├── health.js
│   └── webhook.js
├── data/
│   └── .gitkeep
├── docs/
│   └── ADDING_FEATURES.md
├── scripts/
│   ├── delete-webhook.js
│   ├── set-commands.js
│   └── set-webhook.js
├── src/
│   ├── features/
│   │   ├── ai.js
│   │   └── tools.js
│   ├── bot.js
│   ├── config.js
│   ├── store.js
│   └── telegram.js
├── .env.example
├── .gitignore
├── package.json
├── server.js
└── vercel.json
```

## Security checklist before launch

- Keep `.env` out of version control.
- Use a different long random value for `APP_SECRET` and `TELEGRAM_WEBHOOK_SECRET`.
- Configure Upstash Redis and confirm `/api/health` reports `upstash-redis`.
- Set the correct administrator IDs. Do not leave the sample ID in production.
- Test subscription invoice, successful payment, and renewal behaviour with Telegram's test environment.
- Publish accurate Terms, Privacy, Refund, and Support information. Replace the starter `/privacy` notice with a complete policy for your actual business.
- Obtain commercial permission for every external API used in the paid service.
- Add monitoring, backups, rate limiting, and payment reconciliation before scaling.

## Limitations in this starter

This repository is a foundation, not a fully audited SaaS billing platform. It does not yet include a browser-based owner dashboard, affiliate programme, team workspaces, broadcast campaigns, user data export/deletion commands, or automated reconciliation against Telegram's transaction history. Add and test those capabilities before selling them as included features.

## Licence

MIT. See `LICENSE`.
=======
# ith-telegram-multitask-bot
Multitask telegram bot
>>>>>>> 55a1eae329d2bc786c51893369c4bec3cb1d8889
