# Nexus

Nexus is a modular Discord platform composed of a sharding-ready bot, Fastify API,
persistent worker, Next.js dashboard, Supabase PostgreSQL database, and a trusted
first-party plugin runtime. The repository is a strict TypeScript pnpm monorepo.

## Services

- `apps/dashboard`: Next.js App Router dashboard deployed to Vercel.
- `apps/api`: authenticated REST API, deployed as an always-on Node.js service.
- `apps/bot`: persistent Discord Gateway process, deployed as an always-on Node.js
  service. Its HTTP server exposes `/health` and `/ready` on `PORT`.
- `apps/worker`: persistent `pg-boss` jobs and outbox delivery, deployed as an
  always-on Node.js worker.
- `supabase`: versioned PostgreSQL migrations and development-safe seed data.

The dashboard runs on Vercel. Bot, API, and worker Node.js apps are designed for
Bonto.dev (or any equivalent always-on Node.js host) and do not depend on a
provider-specific API or manifest.

## Requirements

- Node.js 22 (Node 20.19 is sufficient for local builds)
- pnpm 10.15.1 through Corepack
- Docker for the local Supabase stack and image validation
- Discord application and hosted Supabase project
- An always-on Bonto.dev app plan for the bot and durable jobs

## Local development

```bash
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env
pnpm db:start
pnpm db:reset
pnpm dev
```

The dashboard defaults to `http://localhost:3000`, API to
`http://localhost:3001`, and the bot health listener to
`http://localhost:3002`. Set `DISCORD_DEV_GUILD_ID` so command changes register
immediately in a test guild.

Quality gates:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm db:lint
docker compose build
```

## Discord application

Create a bot and configure the Supabase Discord OAuth provider with the client ID
and secret. Add these exact callback URLs to the Discord application:

- Local: `http://127.0.0.1:54321/auth/v1/callback`
- Production: `https://<project-ref>.supabase.co/auth/v1/callback`

The dashboard asks for `identify` and `guilds`. Invite the bot with the `bot` and
`applications.commands` scopes. Do not grant Administrator globally; enable only
the permissions needed by installed plugins. Privileged intents are added only
when an enabled, reviewed plugin requires them.

## Supabase

Link and deploy migrations without creating tables manually:

```bash
pnpm exec supabase link --project-ref <project-ref>
pnpm db:migrate
```

Use the Supabase session pooler for long-lived Bonto.dev services. Keep the
service-role key and database URL in Bonto.dev/Vercel encrypted environment
variables; neither is a `NEXT_PUBLIC_` value.

## Vercel dashboard

Import the GitHub repository, set the Root Directory to `apps/dashboard`, enable
access to files outside the root for the workspace packages, and use pnpm. Set
`NEXT_PUBLIC_APP_URL`, `API_URL`, the public Supabase values, and all `LEGAL_*`
operator fields for Production and Preview. The OAuth allow-list must include the
production and intended preview callback URLs.

The intended production origin is `https://nexus.syntax-xxx.is-a.dev`. Until the
custom domain is verified in Vercel, the project remains reachable through its
`*.vercel.app` alias.

## Bonto.dev bot, API, and worker

Create three always-on Node.js apps in Bonto.dev from this repository. Bonto reads
the root `package.json`, installs npm dependencies, and runs its `start` script.
Authenticate the Bonto CLI with `bonto auth login` and the device code shown at
`bonto.dev/authorize`, then create an app and connect the GitHub repository. The
repository provides these service commands:

| Service | Startup command | Process | Health |
| --- | --- | --- | --- |
| Bot | `npm start` or `npm run start:bot` | Discord Gateway | `GET /health`, `GET /ready` |
| API | `npm run start:api` | Fastify REST API | `GET /health`, `GET /ready` |
| Worker | `npm run start:worker` | pg-boss/outbox worker | process logs |

Set Bonto's Node.js version to 22 and use an always-on plan. Bonto injects `PORT`;
the bot defaults to `3002` and the API uses `API_PORT` (default `3001`). Bindings
are already `0.0.0.0`; no long-running process is required on Vercel.

For the bot app, leave the startup command as `npm start` (or explicitly set
`npm run start:bot`). Bonto automatically runs the root script. For the other
apps set `npm run start:api` and `npm run start:worker` respectively.

Required bot variables:

```text
NODE_ENV=production
LOG_LEVEL=info
PORT=<Bonto bot port, supplied by Bonto>
PLUGIN_DIRECTORY=plugins
DATABASE_URL=<Supabase session-pooler URL>
DISCORD_TOKEN=<secret>
DISCORD_CLIENT_ID=<application id>
DISCORD_DEV_GUILD_ID=<optional test guild id>
```

Required API variables:

```text
NODE_ENV=production
API_HOST=0.0.0.0
API_PORT=<Bonto API port>
DATABASE_URL=<Supabase session-pooler URL>
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<secret>
TOKEN_ENCRYPTION_KEY=<32-byte secret>
INTERNAL_SIGNING_SECRET=<secret>
DASHBOARD_URL=https://nexus.syntax-xxx.is-a.dev
```

Required worker variables:

```text
NODE_ENV=production
DATABASE_URL=<Supabase session-pooler URL>
NEXUS_INSTANCE_ID=<unique instance id>
```

Configure Bonto's health probe to call `/health` for the bot and API. The endpoint
confirms that the process is serving; it cannot prevent a provider from sleeping a
free app. `/ready` intentionally remains non-ready until the Discord gateway and
PostgreSQL connection are available.

After Bonto gives the API an HTTPS hostname, set that exact URL as `API_URL` in
Vercel and redeploy the dashboard. Point `nexusba.syntax-xxx.is-a.dev` (or the
chosen bot/API hostname) at the target supplied by Bonto.dev according to its
custom-domain instructions; do not guess a DNS target. Verify the services with:

```bash
curl --fail https://<bonto-bot-host>/health
curl --fail https://<bonto-bot-host>/ready
curl --fail https://<bonto-api-host>/health
curl --fail https://<bonto-api-host>/ready
```

## Legal and privacy

German terms and privacy pages are available at `/de/nutzungsbedingungen` and
`/de/datenschutz`. When required operator fields are absent, the pages show a
visible configuration warning and safe non-address placeholders instead of
publishing invented legal information. Fill every `LEGAL_*` value and have the
texts reviewed for the operator's actual business model, integrations, retention
settings, and hosting regions before launch.

## Plugin trust boundary

Only reviewed built-in plugins execute. Manifests, lifecycle cleanup, path
containment, isolated execution support, timeouts, and health state reporting are
provided, but importing arbitrary JavaScript is not a security sandbox. The
marketplace may store metadata; uploaded executable code remains disabled until a
separate hardened sandbox is deployed.
