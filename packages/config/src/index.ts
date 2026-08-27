import { z } from "zod";

const logLevel = z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]);
const baseSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url().startsWith("postgres"),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  LOG_LEVEL: logLevel.default("info"),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
  TRUSTED_PROXY_CIDRS: z.string().default("127.0.0.1/32,::1/128"),
});

export const botEnvironmentSchema = baseSchema.extend({
  DISCORD_TOKEN: z.string().min(20),
  DISCORD_CLIENT_ID: z.string().regex(/^\d{17,20}$/),
  DISCORD_DEV_GUILD_ID: z.string().regex(/^\d{17,20}$/).optional(),
  PLUGIN_DIRECTORY: z.string().default("../../plugins"),
  PLUGIN_RPC_TIMEOUT_MS: z.coerce.number().int().min(500).max(60_000).default(10_000),
});

export const apiEnvironmentSchema = baseSchema.extend({
  API_HOST: z.string().default("0.0.0.0"),
  API_PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
  DASHBOARD_URL: z.string().url(),
  INTERNAL_SIGNING_SECRET: z.string().min(32),
  TOKEN_ENCRYPTION_KEY: z.string().min(43),
  OWNER_DISCORD_IDS: z.string().default(""),
});

export type BotEnvironment = z.infer<typeof botEnvironmentSchema>;
export type ApiEnvironment = z.infer<typeof apiEnvironmentSchema>;

export class EnvironmentValidationError extends Error {
  constructor(readonly variables: readonly string[]) {
    super(`Invalid or missing environment variables: ${variables.join(", ")}`);
    this.name = "EnvironmentValidationError";
  }
}

export function parseEnvironment<T>(schema: z.ZodType<T>, source = process.env): T {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    throw new EnvironmentValidationError(parsed.error.issues.map((issue) => issue.path.join(".")));
  }
  return parsed.data;
}
