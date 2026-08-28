# Nexus

Nexus is a modular Discord platform composed of a sharding-ready bot, Fastify API,
persistent worker, Next.js dashboard, Supabase PostgreSQL database, and a trusted
first-party plugin runtime. The repository is a strict TypeScript pnpm monorepo.

## Services

- `apps/dashboard`: Next.js App Router dashboard deployed to Vercel.
- `apps/api`: authenticated REST API deployed as a Render Web Service.
- `apps/bot`: persistent Discord Gateway process deployed as a Render Web Service.
  Its small HTTP server exposes `/health` and `/ready` on `PORT`.
- `apps/worker`: persistent `pg-boss` jobs and outbox delivery deployed as a Render
  Background Worker.
- `supabase`: versioned PostgreSQL migrations and development-safe seed data.

## Requirements

- Node.js 22 (Node 20.19 is sufficient for local builds but Supabase is deprecating it)
- pnpm 10.15.1 through Corepack
- Docker for the local Supabase stack and image validation
- Discord application and hosted Supabase project

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

Use the session pooler for hosted Render instances. Keep the service-role key and
database URL in Render/Vercel encrypted environment variables; neither is a
`NEXT_PUBLIC_` value.

## Vercel dashboard

Import the GitHub repository, set the Root Directory to `apps/dashboard`, enable
access to files outside the root for the workspace packages, and use pnpm. Set
`NEXT_PUBLIC_APP_URL`, `API_URL`, the public Supabase values, and all `LEGAL_*`
operator fields for Production and Preview. The OAuth allow-list must include the
production and intended preview callback URLs.

## Render bot, API, and worker

Create a Blueprint from `render.yaml` in the GitHub repository. It provisions
three paid, always-on Docker services in Frankfurt: `nexus-bot` (Web Service),
`nexus-api` (Web Service), and `nexus-worker` (Background Worker). Free
instances sleep and are not suitable for a Discord Gateway or durable jobs.

The bot requires `DATABASE_URL`, `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, and an
optional `DISCORD_DEV_GUILD_ID` secret. The API requires `DATABASE_URL`,
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TOKEN_ENCRYPTION_KEY`, and the
exact Vercel origin in `DASHBOARD_URL`. Render supplies `PORT`; bot and API bind
to `0.0.0.0` and expose `/health` plus `/ready`.

Verify after deployment:

```bash
curl --fail https://<render-bot-domain>/health
curl --fail https://<render-bot-domain>/ready
```

Point the API custom hostname at Render's DNS target and set that HTTPS origin as
`API_URL` in Vercel. Set `DASHBOARD_URL` in the API to the exact Vercel/custom
dashboard origin so credentialed CORS remains restricted. The Render health
checks use `/health`; keep all three services at one instance minimum.

After deployment verify:

```bash
curl --fail https://<render-api-domain>/health
curl --fail https://<render-api-domain>/ready
```

`/ready` intentionally fails until Discord and PostgreSQL are connected.

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
