# Family Health MCP

Private family health monitoring on Cloudflare Workers. The project connects Claude custom
connectors and cloud Routines to **Google Health API v4**, adds fixed-recipient Telegram summaries,
and optionally stores menstrual-cycle observations in Cloudflare D1.

The Google Health integration is read-only. It covers activity, sleep, heart rate, SpO2, HRV,
respiratory rate, skin-temperature variation, weight, body fat and nutrition. Telegram and cycle
tools write only to the resources configured by the server owner.

Based on [tachibanayu24/fitbit-googlehealth-mcp](https://github.com/tachibanayu24/fitbit-googlehealth-mcp)
(MIT). Upstream documents are preserved under `docs/upstream-*`.

## What This Builds

```text
Google Health profile A ─→ Worker A ─┐
                                     ├─→ Claude conversation / daily Routine
Google Health profile B ─→ Worker B ─┘                 │
                                                       └─→ fixed Telegram recipients

Spouse Health Worker ─→ D1 cycle observations (optional)
```

- Each Google Health profile has its own OAuth tokens, cache and Worker URL.
- Claude can query either profile without combining the underlying records.
- A single Routine can read both connectors and send one combined daily report.
- Telegram recipients are fixed in Worker secrets; the model cannot choose another `chat_id`.
- Menstrual-cycle observations are stored only in the spouse D1 database and are not written back
  to Google Health.

## Tools

### Google Health reads

| Domain | Methods |
|---|---|
| Profile and devices | `getProfile`, `listDevices` |
| Activity | steps, distance, calories, floors and daily summaries |
| Exercise | recent exercise sessions |
| Sleep | one-day and range sleep logs |
| Heart | resting and intraday heart rate |
| Vitals | HRV, SpO2, respiratory rate, skin-temperature variation and VO2 max |
| Body and nutrition | weight, body fat and food logs |

These are exposed as 16 read-only MCP tools.

### Family additions

| MCP tool | Availability | Purpose |
|---|---|---|
| `send_telegram_alert` | Every configured Worker | Sends one summary to fixed private recipients |
| `save_cycle_observation` | Worker with `HEALTH_DB` only | Records or corrects a cycle date or symptom entry |
| `get_cycle_history` | Worker with `HEALTH_DB` only | Reads cycle starts, symptoms and cycle-length context |

`save_cycle_observation` records a period start, its total duration, optional flow, symptoms and a
short private note. It must only be called after an explicit user request. A scheduled Routine
should read cycle history but must never create or modify observations.

## Important Cycle Health Limitation

The Google Health mobile app includes **Cycle health**, but the current
[Google Health API v4 data type list](https://developers.google.com/health/data-types) does not
expose menstruation or cycle records. This project therefore cannot automatically import dates
entered in the Google Health app.

The optional D1 tools provide a private replacement:

```text
User tells Claude: "Record today as the first day of my period.
It lasted 6 days, with cramps and fatigue at severity 2."
                  ↓
Spouse Health MCP saves the observation to D1
                  ↓
The daily Routine compares cycle history with sleep temperature,
resting heart rate, HRV, sleep and symptoms
```

The cycle estimate is informational. It is not suitable for contraception, fertility decisions or
medical diagnosis.

## Prerequisites

- Node.js 20 or newer and pnpm
- A Cloudflare account with Workers, KV and optional D1
- A Google Cloud project with Google Health API enabled
- A Claude account that supports custom connectors and cloud Routines
- A Telegram Bot token and the private `chat_id` for each recipient

## 1. Google Cloud OAuth

1. Create a Google Cloud project and enable **Google Health API**.
2. Configure an External OAuth application.
3. Add these read-only scopes:

```text
https://www.googleapis.com/auth/googlehealth.profile.readonly
https://www.googleapis.com/auth/googlehealth.settings.readonly
https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly
https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly
https://www.googleapis.com/auth/googlehealth.sleep.readonly
https://www.googleapis.com/auth/googlehealth.nutrition.readonly
```

4. Create a Web application OAuth client with this redirect URI:

```text
http://127.0.0.1:8787/oauth/callback
```

Google Health scopes are restricted. Testing-mode refresh tokens can expire after seven days, and
Google may block unverified access for users who are not associated with the project. Public or
multi-user deployments may require OAuth verification. Never publish the OAuth client secret.

## 2. Deploy the First Profile

```bash
pnpm install
cp wrangler.toml.example wrangler.toml

pnpm wrangler kv namespace create TOKENS
pnpm wrangler kv namespace create CACHE
```

Paste the returned namespace IDs into the untracked `wrangler.toml`.

Load the OAuth client into the current terminal and run the local authorization bootstrap:

```bash
export GOOGLE_CLIENT_ID='...'
export GOOGLE_CLIENT_SECRET='...'
pnpm run setup:google
```

Store the resulting OAuth tokens in the `TOKENS` KV binding using the commands printed by the
script. Add Worker secrets:

```bash
pnpm wrangler secret put GOOGLE_CLIENT_ID
pnpm wrangler secret put GOOGLE_CLIENT_SECRET
pnpm wrangler secret put MCP_SHARED_SECRET
pnpm wrangler secret put TELEGRAM_BOT_TOKEN
pnpm wrangler secret put TELEGRAM_CHAT_ID
```

Generate `MCP_SHARED_SECRET` with `openssl rand -hex 32`. It is embedded in the MCP URL path and must
never be committed or shown in screenshots.

For multiple fixed Telegram recipients, add this optional secret:

```bash
pnpm wrangler secret put TELEGRAM_CHAT_IDS
```

Its value is a comma-separated list such as `123456789,987654321`. When present, it supersedes
`TELEGRAM_CHAT_ID`.

Deploy:

```bash
pnpm wrangler deploy
```

Add a Claude custom connector using:

```text
https://<worker>.workers.dev/mcp/<MCP_SHARED_SECRET>
```

## 3. Deploy a Second Family Profile

Each person must use a separate Google account and separate Worker token storage.

```bash
cp wrangler.spouse.toml.example wrangler.spouse.toml

pnpm wrangler kv namespace create SPOUSE_TOKENS
pnpm wrangler kv namespace create SPOUSE_CACHE
```

Paste the returned IDs into `wrangler.spouse.toml`. Repeat Google OAuth while signed in to the
second person's account, then store tokens with `--config wrangler.spouse.toml`.

Set a separate MCP secret and the required Google and Telegram secrets:

```bash
pnpm wrangler secret put GOOGLE_CLIENT_ID --config wrangler.spouse.toml
pnpm wrangler secret put GOOGLE_CLIENT_SECRET --config wrangler.spouse.toml
pnpm wrangler secret put MCP_SHARED_SECRET --config wrangler.spouse.toml
pnpm wrangler secret put TELEGRAM_BOT_TOKEN --config wrangler.spouse.toml
pnpm wrangler secret put TELEGRAM_CHAT_ID --config wrangler.spouse.toml
pnpm wrangler secret put TELEGRAM_CHAT_IDS --config wrangler.spouse.toml
```

Deploy and add the second Worker URL as a separate Claude connector:

```bash
pnpm wrangler deploy --config wrangler.spouse.toml
```

## 4. Enable Private Cycle and Symptom Records

Create one D1 database for the spouse profile:

```bash
pnpm wrangler d1 create family-health-spouse --location=enam
```

Paste the returned database ID into `wrangler.spouse.toml`, then apply the tracked migration:

```bash
pnpm wrangler d1 migrations apply family-health-spouse \
  --remote --config wrangler.spouse.toml
```

Redeploy the spouse Worker:

```bash
pnpm wrangler deploy --config wrangler.spouse.toml
```

After reconnecting the Claude connector, only the spouse connector will expose
`save_cycle_observation` and `get_cycle_history`.

Useful natural-language recording examples:

```text
Use Spouse Health to record 2026-07-25 as the first day of my period,
lasting 6 days, with cramps and fatigue at severity 2.
```

```text
Use Spouse Health to add bloating and headache with mild severity for 2026-07-23.
```

Backfill at least three historical period-start dates before expecting a basic cycle-length
estimate. Six or more cycles are better when cycle length varies.

## 5. Daily Claude Routine

Create one cloud Routine with both profile connectors and a daily schedule. A complete Chinese
prompt is provided in
[docs/family-routine-prompt-zh.md](./docs/family-routine-prompt-zh.md).

The supplied prompt:

- always sends a daily report, even when there is no alert;
- keeps the two profiles separate;
- compares each person with their own baseline;
- gives conservative activity recommendations;
- reads cycle history without modifying it;
- sends only one combined Telegram message to avoid duplicates.

Cloud Routines may use connector write tools without interactive approval. Review the attached
connectors and prompt carefully before enabling unattended execution.

## Security and Privacy

- Never commit `wrangler.toml`, `wrangler.spouse.toml`, OAuth tokens, bot tokens or MCP URLs.
- Telegram bot chats are cloud chats, not end-to-end encrypted Secret Chats. Send summaries rather
  than raw minute-level records.
- Only share another person's health or cycle summary after explicit consent.
- Treat the D1 cycle database as sensitive health information.
- Rotate an MCP secret immediately if its complete URL is exposed.
- Google Health remains read-only; cycle observations live only in the private D1 database.

## Development

```bash
pnpm typecheck
pnpm test
pnpm lint
pnpm wrangler deploy --dry-run
```

Migrations are tracked under `migrations/`. Apply them explicitly before deploying code that uses a
new schema.

## License

MIT. See [LICENSE](./LICENSE). Upstream copyright is preserved.
