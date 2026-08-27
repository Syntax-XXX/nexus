import { apiEnvironmentSchema, parseEnvironment } from "@nexus/config";
import { createDatabase } from "@nexus/database";
import { createLogger } from "@nexus/logger";
import { createServer } from "./server.js";

const config = parseEnvironment(apiEnvironmentSchema);
const logger = createLogger("api", config.LOG_LEVEL);
const database = createDatabase(config.DATABASE_URL);
const app = await createServer({ config, database, logger });

let closing = false;
async function shutdown(signal: string): Promise<void> {
  if (closing) return;
  closing = true;
  logger.info({ signal }, "Shutting down");
  await app.close();
  await database.close();
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

await app.listen({ host: config.API_HOST, port: config.API_PORT });
