import { PgBoss } from "pg-boss";
import { z } from "zod";
import { parseEnvironment } from "@nexus/config";
import { createDatabase } from "@nexus/database";
import { createLogger } from "@nexus/logger";

const environmentSchema = z.object({
  DATABASE_URL: z.string().url().startsWith("postgres"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  NEXUS_INSTANCE_ID: z.string().default("worker-local"),
});
const config = parseEnvironment(environmentSchema);
const logger = createLogger("worker", config.LOG_LEVEL);
const database = createDatabase(config.DATABASE_URL);
const boss = new PgBoss({ connectionString: config.DATABASE_URL, schema: "nexus_jobs", application_name: "nexus-worker" });

boss.on("error", (error: Error) => logger.error({ error }, "Job queue error"));
await boss.start();

await boss.createQueue("outbox.publish", { retryLimit: 10, retryBackoff: true, expireInSeconds: 30 });
await boss.work("outbox.publish", { batchSize: 50 }, async () => {
  const rows = await database.sql.begin(async (sql) => sql<{
    id: string;
    event_type: string;
    payload: unknown;
  }[]>`
    select id, event_type, payload
    from public.domain_outbox
    where published_at is null
    order by occurred_at
    limit 50
    for update skip locked
  `);

  for (const event of rows) {
    try {
      await database.sql`select pg_notify('nexus_domain_events', ${JSON.stringify(event)})`;
      await database.sql`
        update public.domain_outbox set published_at = now(), attempts = attempts + 1, last_error = null
        where id = ${event.id}::uuid
      `;
    } catch (error) {
      await database.sql`
        update public.domain_outbox
        set attempts = attempts + 1, last_error = ${error instanceof Error ? error.message : String(error)}
        where id = ${event.id}::uuid
      `;
      throw error;
    }
  }
});

await boss.schedule("outbox.publish", "*/2 * * * * *", {}, { tz: "UTC" });

let closing = false;
async function shutdown(signal: string): Promise<void> {
  if (closing) return;
  closing = true;
  logger.info({ signal }, "Shutting down");
  await boss.stop({ graceful: true, timeout: 10_000 });
  await database.close();
}
process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

logger.info({ instanceId: config.NEXUS_INSTANCE_ID }, "Worker ready");
