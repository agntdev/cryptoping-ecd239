# CryptoWatch Private Alerts — Bot specification

**Archetype:** finance

**Voice:** professional and concise — write every user-facing message, button label, error, and empty state in this voice.

A personal Telegram bot that lets each user maintain a private watchlist of crypto tickers, create per-coin alerts (price-threshold and percent-change over a window), perform on-demand price checks, configure quiet hours and an optional morning digest, and delivers owner metrics (total active users and top-triggered tickers) to the owner's chat.

> This is the complete contract for the bot. Implement EVERY entry point, flow, feature, integration, and edge case below. The completeness review checks the bot against this document after each build pass.

## Primary audience

- Individual crypto watchers
- Retail traders who want private alerts and simple analytics

## Success criteria

- Users can add/remove tickers and create both price-threshold and percent-change alerts via guided flows
- Alerts trigger and deliver a single clear notification (ticker, old price, new price, percent change, alert type, timestamp) and then enter cooldown/hysteresis
- Users can request /price <ticker> or /price (for watchlist) and receive up-to-date prices
- Quiet hours suppress alerts and queued alerts appear in morning summary if enabled
- Owner receives periodic or on-demand dashboard messages in OWNER_CHAT_ID with total active users and top N tickers by trigger count
- All user watchlists, alert rules, settings, last-known prices, and last-triggered timestamps persist privately per user

## Entry points

Every feature must be reachable from the bot's command/button surface (button-first; only /start and /help are slash commands).

- **/start** (command, actor: user, command: /start) — Open the main menu and begin onboarding
  - outputs: Welcome card with quick buttons: Add coin, My list, /price, Settings, Help
- **Add coin** (button, actor: user, callback: watchlist:add_coin) — Start flow to add a coin to the user's watchlist; offers seed buttons and free-text
  - inputs: seed button selection (BTC, ETH, TON), or free-text ticker (e.g., SOL, ADA)
  - outputs: Confirmation of added watchlist item and inline controls (Add price threshold, Add percent alert, Edit, Delete)
- **My list** (button, actor: user, callback: watchlist:view) — Open the user's watchlist and per-item controls
  - outputs: Paginated list of watchlist items with inline controls per item (Add alert, Edit, Delete, /price for that ticker)
- **/price** (command, actor: user, command: /price) — /price <ticker> fetches current price for a single ticker; /price alone returns current prices for the user's watchlist
  - inputs: optional ticker symbol
  - outputs: Current price(s) in user's fiat (default USD); friendly error/suggestion for unknown tickers
- **Settings** (button, actor: user, callback: user:settings) — Open settings to set timezone, quiet hours, morning summary time, and per-user defaults
  - inputs: timezone selection, quiet hours start/end times, morning summary enable + time, alert cooldown override preference
  - outputs: Updated user preferences saved and confirmation message
- **/help** (command, actor: user, command: /help) — Show help and rules summary, examples for /price usage, and links to privacy info
  - outputs: Short help card in the bot voice
- **/dashboard** (command, actor: owner, command: /dashboard) — Owner-only command to request current metrics dashboard to OWNER_CHAT_ID
  - outputs: Owner dashboard message: total active users, top N tickers by trigger count, recent system errors

## Flows

### Onboarding and Main Menu
_Trigger:_ /start

1. Send welcome card with short instructions and quick buttons (Add coin, My list, /price, Settings, Help)
2. If first-time user, prompt to set timezone (optional) to align quiet hours and morning summary
3. Store minimal user profile and defaults

_Data touched:_ User profile

### Add coin to watchlist
_Trigger:_ watchlist:add_coin button

1. Offer inline seed buttons (Bitcoin/BTC, Ethereum/ETH, Toncoin/TON) and 'Other ticker' text entry
2. If seed pressed, fetch canonical ticker metadata and add to watchlist; if free-text, validate ticker via price API
3. On success, present per-item inline controls: Add price threshold, Add percent alert, Edit, Delete

_Data touched:_ Watchlist item, Price snapshot (last-known)

### Create price-threshold alert
_Trigger:_ callback from watchlist item: Add price threshold

1. Prompt: enter target price (in user's fiat). Use ForceReply for free-text numeric input
2. Validate numeric input and show confirmation with quick buttons: Notify when ABOVE / Notify when BELOW
3. On confirmation, create Alert entity with configured cooldown and hysteresis, save and ACK to user

_Data touched:_ Alert, Watchlist item

### Create percent-change alert
_Trigger:_ callback from watchlist item: Add percent alert

1. Prompt: choose percent via quick replies (1%, 3%, 5%, 10%) or enter custom percent via ForceReply
2. Prompt: choose time window (default 1 hour) via inline options (15m, 1h, 4h, 24h) or free-text
3. Confirm summary and save Alert entity with last-known baseline price and last-triggered timestamp unset

_Data touched:_ Alert, Watchlist item

### On-demand price check
_Trigger:_ /price command

1. If ticker passed, validate and fetch price; if no args, fetch prices for user's watchlist
2. Return price(s) in user's fiat with timestamp and source attribution
3. If price-source error, retry quietly up to configured attempts; if unresolved, send gentle error recommending try later

_Data touched:_ Price snapshot

### Alert evaluation and delivery
_Trigger:_ scheduled price poll or significant price update from API

1. Fetch latest prices for all watched tickers (batch where possible)
2. For each user's alerts evaluate conditions (price threshold or percent-change over window) using stored baselines and windows
3. Apply quiet hours: if within user's quiet hours, queue alert for morning summary if enabled, otherwise drop
4. If condition met and alert not in cooldown and hysteresis rules satisfied, send single alert message to user and set last-triggered + enter cooldown
5. Increment per-ticker metric counter on actual sent alerts

_Data touched:_ Alert, Metric counters, Price snapshot, User profile (quiet hours/morning summary)

### Morning summary
_Trigger:_ user local time daily at configured time (or disabled)

1. Aggregate queued/suppressed alerts during quiet hours and notable moves since last summary
2. Format a concise digest listing tickers, brief notes on missed alerts and notable percent moves
3. Send summary to user and clear queued items

_Data touched:_ Queued alerts, User profile

### Owner dashboard delivery
_Trigger:_ periodic schedule or /dashboard command

1. Aggregate metrics: total active users (non-empty watchlist within X days) and top N tickers by trigger count (N default 10)
2. Send a compact dashboard message to OWNER_CHAT_ID
3. Owner may request reset of counters or change global defaults via owner-only callbacks

_Data touched:_ Metric counters

### Error and retry handling for price API
_Trigger:_ transient price API error

1. Retry request up to configured retry count with exponential backoff
2. If still failing, log the incident, avoid generating alerts based on stale/unverifiable data, and surface a single gentle user-facing error if user-requested (e.g., /price)
3. Report aggregated recent failures to owner dashboard for visibility

_Data touched:_ System logs, Metric counters

## Owner-supplied settings

The OWNER provides these; they are collected in chat and injected into the environment at deploy. Read each one from the environment where it is used (`ctx.env.<KEY>` / `env.<KEY>` on Cloudflare Workers; `process.env.<KEY>` only as a Node/harness fallback — never the sole read). Do NOT invent your own way of learning the value, do NOT ask for it in a bot message, and do NOT hardcode a default.

- **ADMIN_CHAT_ID** — Owner chat where dashboards and admin notifications are sent
  - this is the OWNER's own chat id; the platform already knows it. Read `ADMIN_CHAT_ID` via `ctx.env` (prefer toolkit `adminChatId` / `requireOwner`) — never ask a user, never treat whoever writes first as the admin, never invent claim-admin or open manage for everyone.
  - may be UNSET at runtime: the bot must still start, and the feature needing ADMIN_CHAT_ID must say so plainly instead of failing.

Your behavioral specs run WITHOUT these values, so no spec may depend on one.

## Data entities

Durable data (must survive a restart) uses the toolkit's persistent store, never in-memory maps.

An entity that merely NAMES an owner-supplied setting above (an admin chat, an API account) is not something to store or discover — read it from the environment.

- **User profile** _(retention: persistent)_ — Per-user settings and metadata
  - fields: telegram_id, timezone, fiat_currency (default USD), quiet_hours_start, quiet_hours_end, morning_summary_enabled, morning_summary_time, default_alert_cooldown_hours, hysteresis_percent
- **Watchlist item** _(retention: persistent)_ — A single user-owned watchlist entry for a ticker
  - fields: ticker_symbol, display_name, exchange_hint (optional), added_at, last_known_price
- **Alert** _(retention: persistent)_ — Alert rule attached to a watchlist item
  - fields: alert_id, user_id, watchlist_item_id, type (price_threshold | percent_change), parameters (price, direction OR percent, window), created_at, last_triggered_at, cooldown_hours, is_enabled
- **Price snapshot** _(retention: persistent)_ — Latest fetched price for a ticker used for evaluation and /price responses
  - fields: ticker_symbol, price, currency, timestamp, source
- **Metric counters** _(retention: persistent)_ — Aggregated owner-visible metrics (no per-user sensitive data leaked)
  - fields: per_ticker_trigger_count, total_active_users, recent_error_counts
- **Queued alert (suppressed)** _(retention: persistent)_ — Alerts suppressed during quiet hours and eligible for morning summary
  - fields: alert_id, user_id, watchlist_item_id, detected_at, reason_suppressed

## Integrations

- **Telegram** (required) — Bot API messaging (user-facing notifications, inline buttons, callbacks, owner dashboard)
- **Public Crypto Price API** (required) — Fetch ticker prices and historical prices for percent-change windows
Call external APIs against their real contract (correct endpoints, ids, params); credentials from env. Do not fake responses.

## Owner controls

- Request immediate owner dashboard (/dashboard) delivered to OWNER_CHAT_ID
- Set or update global defaults (default cooldown, hysteresis percent, percent-change default window)
- Reset metric counters (owner-only)
- Change top-N cap for dashboard (up to 100) — stored in bot config

## Notifications

- User alert message (single notification when condition met): ticker, old price, new price, percent change, alert type, timestamp
- Queued alerts aggregated into morning summary (if enabled)
- On-demand /price responses to user
- Friendly error messages for unknown tickers or unresolved price-source failures
- Owner dashboard message listing total active users and top N tickers by trigger count

## Permissions & privacy

- All watchlists, alert rules, last-known prices, and settings are private per user and never shared
- Owner-visible metrics are aggregated counts only (no per-user identifiers)
- Bot sends notifications only to the individual user's private chat; no group broadcasts
- If user revokes or deletes chat, personal data retention follows platform policy (owner must specify retention period) — see missing_fields

## Edge cases

- Ambiguous or unknown ticker symbols: validate with price API and offer suggestions or seed buttons; do not add unverified tickers without user confirmation
- Price API transient failures: retry silently; do not generate alerts from stale/unverifiable data
- Quiet hours spanning midnight (e.g., start 22:00 end 07:00) must be handled using user's timezone and DST rules
- User timezone or DST changes: re-evaluate scheduled morning summary and quiet hours relative to new timezone
- Alert flapping around threshold: enforce hysteresis and cooldown; require movement beyond threshold + hysteresis before re-arming
- High-volume watchlists across many users: batching price requests and rate-limit handling required to avoid API throttling
- User deletes bot or revokes access: ensure metrics accounting and optional data purge handling
- Simultaneous alerts triggering multiple rules for same ticker: coalesce notifications if they are redundant within a short window to avoid spam

## Required tests

- Dialog-level acceptance test: onboarding, add coin (seed and free-text), create price and percent alerts, edit/delete item
- Alert firing test: simulate price movements to trigger price-threshold and percent-change alerts and verify single notification, cooldown, and hysteresis behavior
- Quiet hours and morning summary test: trigger alerts inside quiet hours, verify suppression and appearance in morning summary when enabled, verify dropping when disabled
- On-demand price test: /price <ticker> and /price (watchlist) return expected results; unknown ticker returns friendly suggestion
- Price API failure handling test: induced transient failures cause silent retries and no false alerts; user-facing error on /price when unresolved
- Owner dashboard test: aggregated metrics reflect sent alerts and active users; secret/admin-only access to /dashboard
- Persistence test: restart does not lose user watchlists, alert states, last-triggered timestamps, or queued alerts
- Edge-case tests: quiet hours wrapping midnight, timezone/DST changes, rapid price oscillation (hysteresis and cooldown)

## Assumptions

- Default fiat currency is USD unless user changes it
- Seed watchlist buttons include Bitcoin (BTC), Ethereum (ETH), Toncoin (TON)
- Percent-change window default is 1 hour unless user selects otherwise
- Per-alert default cooldown is 6 hours unless user overrides per-alert or in settings
- Hysteresis default is 0.5% to prevent flapping; owner can adjust global default
- Morning summary is off by default and must be enabled by the user
- Queued suppressed alerts are stored until the morning summary run or until cleared by user/settings
- Top N for owner dashboard defaults to 10 (owner can change via owner controls)
