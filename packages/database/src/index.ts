import postgres, { type Sql } from "postgres";

export interface Database {
  readonly sql: Sql;
  getGuildConfig<T>(guildId: string, key: string): Promise<T | null>;
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
    async ping() {
      const [row] = await sql<{ healthy: number }[]>`select 1 as healthy`;
      return row?.healthy === 1;
    },
    async close() {
      await sql.end({ timeout: 5 });
    },
  };
}
