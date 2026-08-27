import { loadEnvFile } from "node:process";
import { z } from "zod";

try {
  loadEnvFile();
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

const environmentSchema = z.object({
  DISCORD_TOKEN: z.string().min(20),
  DISCORD_CLIENT_ID: z.string().regex(/^\d{17,20}$/),
  DISCORD_DEV_GUILD_ID: z.string().regex(/^\d{17,20}$/).optional(),
  DATABASE_URL: z.string().url().startsWith("postgres"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  PLUGIN_DIRECTORY: z.string().default("../../plugins"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3002),
});

export type BotConfig = z.infer<typeof environmentSchema>;

export function loadConfig(): BotConfig {
  const result = environmentSchema.safeParse(process.env);
  if (!result.success) {
    const names = result.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Invalid or missing environment variables: ${names}`);
  }
  return result.data;
}
