import postgres, { type Sql } from "postgres";
import type {
  CreateModerationCaseInput,
  ModerationCaseDetails,
  ModerationCaseRecord,
  PluginDatabase,
  WarningRecord,
} from "@nexus/plugin-api";

export interface Database extends PluginDatabase {
  readonly sql: Sql;
  getGuildConfig<T>(guildId: string, key: string): Promise<T | null>;
  isPluginEnabled(guildId: string, pluginId: string): Promise<boolean>;
  ensureGuild(input: { id: string; name: string; iconHash: string | null; ownerId: string | null }): Promise<void>;
  ping(): Promise<boolean>;
  close(): Promise<void>;
}

export function createDatabase(connectionString: string): Database {
  const sql = postgres(connectionString, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
    connection: { application_name: process.env.NEXUS_SERVICE_NAME ?? "nexus" },
    transform: { undefined: null },
  });

  return {
    sql,
    async getGuildConfig<T>(guildId: string, key: string): Promise<T | null> {
      const rows = await sql<{ value: T }[]>`
        select value
        from public.guild_configs
        where guild_id = ${guildId} and key = ${key}
        limit 1
      `;
      return rows[0]?.value ?? null;
    },
    async isPluginEnabled(guildId: string, pluginId: string): Promise<boolean> {
      const [row] = await sql<{ enabled: boolean }[]>`
        select coalesce(gp.enabled, p.id = 'ping') as enabled
        from public.plugins p
        left join public.guild_plugins gp on gp.plugin_id = p.id and gp.guild_id = ${guildId}
        where p.id = ${pluginId} and p.globally_enabled = true
        limit 1
      `;
      return row?.enabled ?? false;
    },
    async ensureGuild(input: { id: string; name: string; iconHash: string | null; ownerId: string | null }): Promise<void> {
      await sql.begin(async (transaction) => {
        await transaction`
          insert into public.guilds (id, name, icon_hash, owner_id, active, updated_at)
          values (${input.id}, ${input.name}, ${input.iconHash}, ${input.ownerId}, true, now())
          on conflict (id) do update set
            name = excluded.name, icon_hash = excluded.icon_hash, owner_id = excluded.owner_id,
            active = true, left_at = null, updated_at = now()
        `;
        await transaction`
          insert into public.guild_plugins (guild_id, plugin_id, version, enabled, config, health)
          select ${input.id}, id, latest_version, (id = 'ping'), '{}'::jsonb,
                 case when id = 'ping' then 'healthy'::public.plugin_health_state else 'disabled'::public.plugin_health_state end
          from public.plugins
          where trusted = true and release_state <> 'disabled'
          on conflict (guild_id, plugin_id) do nothing
        `;
      });
    },
    async createModerationCase(input: CreateModerationCaseInput): Promise<ModerationCaseRecord> {
      const [row] = await sql<{
        id: string;
        case_number: number;
        action: string;
        target_user_id: string;
        moderator_user_id: string;
        reason: string | null;
        created_at: Date;
      }[]>`
        insert into public.moderation_cases
          (guild_id, case_number, action, target_user_id, moderator_user_id, reason, duration_seconds, evidence, expires_at)
        values (
          ${input.guildId}, null, ${input.action}, ${input.targetUserId}, ${input.moderatorUserId},
          ${input.reason ?? null}, ${input.durationSeconds ?? null},
          ${JSON.stringify(input.evidence ?? {})}::jsonb, ${input.expiresAt ?? null}
        )
        returning id, case_number, action, target_user_id, moderator_user_id, reason, created_at
      `;
      if (!row) throw new Error("Moderation case was not created");
      return {
        id: row.id,
        caseNumber: row.case_number,
        action: row.action,
        targetUserId: row.target_user_id,
        moderatorUserId: row.moderator_user_id,
        reason: row.reason,
        createdAt: row.created_at.toISOString(),
      };
    },
    async createWarning(input: {
      guildId: string;
      userId: string;
      moderatorUserId: string;
      reason: string;
    }): Promise<WarningRecord> {
      const [row] = await sql<{
        id: string;
        case_id: string;
        case_number: number;
        user_id: string;
        moderator_user_id: string;
        reason: string;
        created_at: Date;
      }[]>`
        with created_case as (
          insert into public.moderation_cases
            (guild_id, case_number, action, target_user_id, moderator_user_id, reason)
          values (${input.guildId}, null, 'warn', ${input.userId}, ${input.moderatorUserId}, ${input.reason})
          returning id, case_number
        )
        insert into public.warnings (guild_id, case_id, user_id, moderator_user_id, reason)
        select ${input.guildId}, id, ${input.userId}, ${input.moderatorUserId}, ${input.reason}
        from created_case
        returning id, case_id, (select case_number from created_case), user_id, moderator_user_id, reason, created_at
      `;
      if (!row) throw new Error("Warning was not created");
      return {
        id: row.id,
        caseId: row.case_id,
        caseNumber: row.case_number,
        userId: row.user_id,
        moderatorUserId: row.moderator_user_id,
        reason: row.reason,
        createdAt: row.created_at.toISOString(),
      };
    },
    async listWarnings(guildId: string, userId: string): Promise<readonly WarningRecord[]> {
      const rows = await sql<{
        id: string;
        case_id: string;
        case_number: number;
        user_id: string;
        moderator_user_id: string;
        reason: string;
        created_at: Date;
      }[]>`
        select w.id, w.case_id, c.case_number, w.user_id, w.moderator_user_id, w.reason, w.created_at
        from public.warnings w
        join public.moderation_cases c on c.id = w.case_id
        where w.guild_id = ${guildId} and w.user_id = ${userId}
          and (w.expires_at is null or w.expires_at > now())
        order by w.created_at desc
        limit 100
      `;
      return rows.map((row) => ({
        id: row.id,
        caseId: row.case_id,
        caseNumber: row.case_number,
        userId: row.user_id,
        moderatorUserId: row.moderator_user_id,
        reason: row.reason,
        createdAt: row.created_at.toISOString(),
      }));
    },
    async getModerationCase(guildId: string, caseNumber: number): Promise<ModerationCaseDetails | null> {
      const [row] = await sql<{
        id: string;
        case_number: number;
        action: string;
        target_user_id: string;
        moderator_user_id: string;
        reason: string | null;
        duration_seconds: number | null;
        expires_at: Date | null;
        active: boolean;
        created_at: Date;
      }[]>`
        select id, case_number, action, target_user_id, moderator_user_id, reason,
               duration_seconds, expires_at, active, created_at
        from public.moderation_cases
        where guild_id = ${guildId} and case_number = ${caseNumber}
        limit 1
      `;
      if (!row) return null;
      return {
        id: row.id,
        caseNumber: row.case_number,
        action: row.action,
        targetUserId: row.target_user_id,
        moderatorUserId: row.moderator_user_id,
        reason: row.reason,
        durationSeconds: row.duration_seconds,
        expiresAt: row.expires_at?.toISOString() ?? null,
        active: row.active,
        createdAt: row.created_at.toISOString(),
      };
    },
    async ping() {
      const [row] = await sql<{ healthy: number }[]>`select 1 as healthy`;
      return row?.healthy === 1;
    },
    async close() {
      await sql.end({ timeout: 5 });
    },
  };
}
