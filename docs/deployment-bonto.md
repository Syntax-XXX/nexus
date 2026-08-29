# Bonto.dev deployment

Nexus backend services are shipped as production TypeScript Node.js apps. Bonto.dev
is the target always-on host for the Discord bot, REST API, and persistent worker.
The repository intentionally contains no provider-specific deployment manifest
because Bonto discovers the root `package.json` and its `start` script.

## Create the apps

Create three Bonto apps from the GitHub repository. Use the repository root as the
app directory and set Node.js 22:

1. Bot: `npm start` (equivalent to `npm run start:bot`)
2. API: `npm run start:api`
3. Worker: `npm run start:worker`

Authenticate the CLI with:

```bash
npm install -g @sidequestvr/bonto
bonto auth login
```

Open the displayed device-code page at `https://bonto.dev/authorize`. Create the
app in the Bonto dashboard or with `bonto apps create`, then connect this GitHub
repository. Pushes to the Bonto Git remote redeploy the app automatically.

Use an always-on plan. Discord Gateway connections and durable jobs must not run on
a sleeping/free instance. Enable automatic restart and graceful SIGTERM handling.

For the bot and API, configure Bonto's HTTP health probe to use `/health`. The bot
and API listen on `0.0.0.0`; Bonto injects `PORT`, so keep the bot on that port and
set `API_PORT` for the API. `/ready` is available for readiness checks and is
expected to fail until dependencies are connected.

## Environment variables

Store all secrets in Bonto's encrypted variables UI. Never commit them to Git.

### Bot

```text
NODE_ENV=production
LOG_LEVEL=info
PORT=<platform HTTP port, usually 3002>
PLUGIN_DIRECTORY=plugins
DATABASE_URL=<Supabase session-pooler connection string>
DISCORD_TOKEN=<Discord bot token>
DISCORD_CLIENT_ID=<Discord application id>
DISCORD_DEV_GUILD_ID=<optional test guild>
```

### API

```text
NODE_ENV=production
API_HOST=0.0.0.0
API_PORT=<platform HTTP port, usually 3001>
DATABASE_URL=<Supabase session-pooler connection string>
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<Supabase service role secret>
TOKEN_ENCRYPTION_KEY=<32-byte encryption secret>
INTERNAL_SIGNING_SECRET=<random signing secret>
DASHBOARD_URL=https://nexus.syntax-xxx.is-a.dev
```

### Worker

```text
NODE_ENV=production
DATABASE_URL=<Supabase session-pooler connection string>
NEXUS_INSTANCE_ID=<unique worker id>
```

Optional integration variables are listed in the root `.env.example`; omit them
until the corresponding plugin is enabled. The API and worker must use the same
database and encryption/signing configuration as the bot/API deployment.

## Domain and Vercel wiring

Use a Bonto-provided HTTPS hostname or custom domain for the API. Once it is live,
set the exact origin (for example `https://api.example.tld`) as `API_URL` in the
Vercel project and redeploy. Set `DASHBOARD_URL` in Bonto's API service to the
exact Vercel/custom dashboard origin so credentialed CORS remains restricted.

The dashboard's intended hostname is `nexus.syntax-xxx.is-a.dev`; Vercel must first
verify ownership before it can serve that hostname. A bot/API hostname such as
`nexusba.syntax-xxx.is-a.dev` must point to the DNS target shown by Bonto.dev; do
not invent a target from another provider.

## Verification

```bash
curl --fail https://<bonto-bot-host>/health
curl --fail https://<bonto-bot-host>/ready
curl --fail https://<bonto-api-host>/health
curl --fail https://<bonto-api-host>/ready
```

`/health` only reports that the HTTP process is alive. `/ready` verifies the
Discord gateway and PostgreSQL dependencies and is the appropriate deployment
readiness signal.
