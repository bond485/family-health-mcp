export type Env = {
  TOKENS: KVNamespace;
  CACHE: KVNamespace;
  // Fitbit creds retained while the legacy provider still compiles.
  FITBIT_CLIENT_ID: string;
  FITBIT_CLIENT_SECRET: string;
  // Google Health API v4 OAuth credentials (set via `wrangler secret put`).
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  MCP_SHARED_SECRET: string;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_CHAT_ID: string;
  TELEGRAM_CHAT_IDS?: string;
  ALLOWED_CIDRS: string;
};
