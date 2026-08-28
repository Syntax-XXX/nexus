import { randomUUID } from "node:crypto";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import sensible from "@fastify/sensible";
import Fastify, { type FastifyRequest } from "fastify";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { updatePluginRequestSchema } from "@nexus/api-contract";
import type { ApiEnvironment } from "@nexus/config";
import type { Database } from "@nexus/database";
import type { NexusLogger } from "@nexus/logger";

interface AuthenticatedActor {
  readonly userId: string;
  readonly discordUserId: string;
}

declare module "fastify" {
  interface FastifyRequest {
    actor?: AuthenticatedActor;
  }
}

export interface ServerDependencies {
  readonly config: ApiEnvironment;
  readonly database: Database;
  readonly logger: NexusLogger;
}

export async function createServer(dependencies: ServerDependencies) {
  const { config, database, logger } = dependencies;
  const app = Fastify({
    loggerInstance: logger,
    genReqId: (request) => request.headers["x-request-id"]?.toString() ?? randomUUID(),
    requestIdHeader: "x-request-id",
    bodyLimit: 1024 * 1024,
    trustProxy: config.TRUSTED_PROXY_CIDRS.split(",").map((cidr) => cidr.trim()),
  });
  const jwks = createRemoteJWKSet(new URL(`${config.SUPABASE_URL}/auth/v1/.well-known/jwks.json`));

  await app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "same-site" },
  });
  await app.register(cors, {
    origin: config.DASHBOARD_URL,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  });
  await app.register(rateLimit, { max: 120, timeWindow: "1 minute" });
  await app.register(sensible);

  app.setErrorHandler((error, request, reply) => {
    request.log.error({ error }, "Request failed");
    const normalized = error instanceof Error ? error : new Error("Unknown request error");
    const candidateStatus = "statusCode" in normalized ? Number(normalized.statusCode) : 500;
    const status = Number.isInteger(candidateStatus) && candidateStatus >= 400 ? candidateStatus : 500;
    const code = "code" in normalized && typeof normalized.code === "string" ? normalized.code : "request_error";
    void reply.status(status).send({
      error: {
        code: status === 500 ? "internal_error" : code,
        message: status === 500 ? "The request could not be completed." : normalized.message,
        requestId: request.id,
      },
    });
  });

  async function authenticate(request: FastifyRequest): Promise<void> {
    const value = request.headers.authorization;
    if (!value?.startsWith("Bearer ")) throw app.httpErrors.unauthorized("A valid session is required");
    const token = value.slice("Bearer ".length);
    const { payload } = await jwtVerify(token, jwks, {
      issuer: `${config.SUPABASE_URL}/auth/v1`,
      audience: "authenticated",
    });
    if (!payload.sub) throw app.httpErrors.unauthorized("Session subject is missing");
    const userId = payload.sub;
    const [profile] = await database.sql<{ discord_user_id: string }[]>`
      select discord_user_id from public.user_profiles where id = ${userId}::uuid limit 1
    `;
    if (!profile) throw app.httpErrors.unauthorized("Discord profile is not linked");
    request.actor = { userId, discordUserId: profile.discord_user_id };
  }

  async function authorizeGuild(request: FastifyRequest, guildId: string): Promise<void> {
    await authenticate(request);
    const actor = request.actor;
    if (!actor) throw app.httpErrors.unauthorized("A valid session is required");
    const [membership] = await database.sql<{ allowed: boolean }[]>`
      select true as allowed
      from public.guild_memberships
      where user_id = ${actor.userId}::uuid
        and guild_id = ${guildId}
        and validated_at > now() - interval '10 minutes'
        and (is_owner or (discord_permissions & 32) = 32 or (discord_permissions & 8) = 8)
      limit 1
    `;
    if (!membership) throw app.httpErrors.forbidden("You cannot manage this guild");
  }

  app.get("/health", async () => ({ status: "ok", service: "api", version: "0.1.0" }));
  app.get("/ready", async (_request, reply) => {
    const healthy = await database.ping().catch(() => false);
    return reply.status(healthy ? 200 : 503).send({ status: healthy ? "ready" : "not_ready", database: healthy });
  });

  app.get("/v1/guilds", { preHandler: authenticate }, async (request) => {
    const actor = request.actor;
    if (!actor) throw app.httpErrors.unauthorized("A valid session is required");
    return database.sql`
      select g.id, g.name, g.icon_hash, g.active, g.setup_completed_at,
             gm.discord_permissions, gm.is_owner
      from public.guild_memberships gm
      join public.guilds g on g.id = gm.guild_id
      where gm.user_id = ${actor.userId}::uuid
        and gm.validated_at > now() - interval '10 minutes'
        and (gm.is_owner or (gm.discord_permissions & 32) = 32 or (gm.discord_permissions & 8) = 8)
      order by lower(g.name), g.id
    `;
  });

  app.get<{ Params: { guildId: string } }>("/v1/guilds/:guildId/plugins", async (request) => {
    await authorizeGuild(request, request.params.guildId);
    return database.sql`
      select p.id, p.name, p.description, p.latest_version as version, p.category, p.maturity,
             coalesce(gp.enabled, false) as enabled,
             coalesce(gp.health, 'disabled') as health,
             coalesce(p.manifest->'dependencies', '{}'::jsonb) as dependencies,
             coalesce(p.manifest->'permissions', '[]'::jsonb) as permissions,
             coalesce(gp.config_version, 0) as config_version
      from public.plugins p
      left join public.guild_plugins gp on gp.plugin_id = p.id and gp.guild_id = ${request.params.guildId}
      where p.release_state <> 'disabled'
      order by p.category, p.name
    `;
  });

  app.post<{ Params: { guildId: string; pluginId: string } }>(
    "/v1/guilds/:guildId/plugins/:pluginId",
    async (request, reply) => {
      await authorizeGuild(request, request.params.guildId);
      const actorId = request.actor?.userId;
      const actorDiscordId = request.actor?.discordUserId;
      if (!actorId || !actorDiscordId) throw app.httpErrors.unauthorized();
      const [plugin] = await database.sql<{ id: string; latest_version: string }[]>`
        select id, latest_version from public.plugins
        where id = ${request.params.pluginId} and release_state <> 'disabled' and globally_enabled = true
        limit 1
      `;
      if (!plugin) throw app.httpErrors.notFound("Plugin is not available");
      const [installed] = await database.sql<{ enabled: boolean; config: unknown; config_version: number }[]>`
        insert into public.guild_plugins (guild_id, plugin_id, version, enabled, config, health)
        values (${request.params.guildId}, ${plugin.id}, ${plugin.latest_version}, false, '{}'::jsonb, 'disabled')
        on conflict (guild_id, plugin_id) do update set version = excluded.version, updated_at = now()
        returning enabled, config, config_version
      `;
      await database.sql`
        insert into public.audit_logs
          (guild_id, actor_user_id, actor_discord_id, action, resource_type, resource_id, new_value, request_id)
        values (
          ${request.params.guildId}, ${actorId}::uuid, ${actorDiscordId}, 'plugin.installed',
          'plugin', ${plugin.id}, ${JSON.stringify(installed)}::jsonb, ${request.id}
        )
      `;
      return reply.code(201).send(installed);
    },
  );

  app.patch<{ Params: { guildId: string; pluginId: string } }>(
    "/v1/guilds/:guildId/plugins/:pluginId",
    async (request, reply) => {
      await authorizeGuild(request, request.params.guildId);
      const input = updatePluginRequestSchema.parse(request.body);
      const actorId = request.actor?.userId;
      if (!actorId) throw app.httpErrors.unauthorized();
      const actorDiscordId = request.actor?.discordUserId;
      if (!actorDiscordId) throw app.httpErrors.unauthorized();
      const result = await database.sql.begin(async (sql) => {
        const [current] = await sql<{ enabled: boolean; config: unknown; config_version: number }[]>`
          select enabled, config, config_version
          from public.guild_plugins
          where guild_id = ${request.params.guildId} and plugin_id = ${request.params.pluginId}
          for update
        `;
        if (!current) throw app.httpErrors.notFound("Plugin is not installed for this guild");
        if (current.config_version !== input.expectedVersion) {
          throw app.httpErrors.conflict("The plugin configuration changed; reload and try again");
        }
        const configJson = input.config === undefined ? null : JSON.stringify(input.config);
        const [updated] = await sql<{ enabled: boolean; config: unknown; config_version: number }[]>`
          update public.guild_plugins
          set enabled = coalesce(${input.enabled ?? null}, enabled),
              config = coalesce(${configJson}::jsonb, config),
              config_version = config_version + 1,
              updated_by = ${actorId}::uuid,
              updated_at = now(),
              enabled_at = case when ${input.enabled ?? null} = true then now() else enabled_at end,
              disabled_at = case when ${input.enabled ?? null} = false then now() else disabled_at end
          where guild_id = ${request.params.guildId} and plugin_id = ${request.params.pluginId}
          returning enabled, config, config_version
        `;
        await sql`
          insert into public.audit_logs
            (guild_id, actor_user_id, actor_discord_id, action, resource_type, resource_id, old_value, new_value, request_id)
          values (
            ${request.params.guildId}, ${actorId}::uuid, ${actorDiscordId}, 'plugin.updated',
            'plugin', ${request.params.pluginId}, ${JSON.stringify(current)}::jsonb, ${JSON.stringify(updated)}::jsonb, ${request.id}
          )
        `;
        await sql`
          insert into public.domain_outbox (event_type, aggregate_type, aggregate_id, guild_id, payload)
          values (
            'guild.config.updated', 'plugin', ${request.params.pluginId}, ${request.params.guildId},
            ${JSON.stringify({ guildId: request.params.guildId, pluginId: request.params.pluginId, version: input.expectedVersion + 1 })}::jsonb
          )
        `;
        return updated;
      });
      return reply.send(result);
    },
  );

  return app;
}
