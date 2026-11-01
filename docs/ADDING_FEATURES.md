# Adding a feature

Keep feature-specific logic in `src/features/` and register its Telegram command in `src/bot.js`.

## Example: add a text utility

1. Add a named function to `src/features/tools.js` (or create a new module when the feature is substantial).
2. Import the function in `src/bot.js`.
3. Add a `case` to the `handleCommand` switch.
4. Call `enforceFreeLimit()` before executing a free tool, or `enforceProAiLimit()` for Pro AI functionality.
5. Add the command to the help response in `src/bot.js`.
6. Add the command description in `scripts/set-commands.js`.
7. Document it in the README.

## Feature implementation rules

- Validate command arguments and impose input-size limits.
- Use timeouts for outbound network requests.
- Never use `eval()` for user-supplied expressions or code.
- Never expose API keys in bot replies or logs.
- Do not treat a pre-checkout event as proof of payment. Grant paid access only after a verified `successful_payment` update.
- Store payment identifiers and make payment processing idempotent.
- Check the commercial licence and attribution requirements of every external API before including it in a paid product.
