import { z } from "zod";
import { discordSnowflakeSchema, healthSchema, maturitySchema } from "@nexus/shared";

export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string(),
    fields: z.record(z.string(), z.array(z.string())).optional(),
  }),
});

export const guildSummarySchema = z.object({
  id: discordSnowflakeSchema,
  name: z.string().min(1),
  iconUrl: z.string().url().nullable(),
  botInstalled: z.boolean(),
  permissions: z.array(z.string()),
  setupCompleted: z.boolean(),
});

export const pluginSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  version: z.string(),
  category: z.string(),
  maturity: maturitySchema,
  health: healthSchema,
  enabled: z.boolean(),
  dependencies: z.array(z.string()),
  permissions: z.array(z.string()),
});

export const updatePluginRequestSchema = z.object({
  enabled: z.boolean().optional(),
  expectedVersion: z.number().int().nonnegative(),
  config: z.record(z.string(), z.unknown()).optional(),
}).refine((value) => value.enabled !== undefined || value.config !== undefined, {
  message: "At least one change is required",
});

export const setupProfileSchema = z.enum(["streamer", "community", "verification", "custom"]);
export const applySetupRequestSchema = z.object({
  profile: setupProfileSchema,
  plugins: z.array(z.string()).min(1),
  configuration: z.record(z.string(), z.record(z.string(), z.unknown())),
  expectedGuildVersion: z.number().int().nonnegative(),
});

export type GuildSummary = z.infer<typeof guildSummarySchema>;
export type PluginSummary = z.infer<typeof pluginSummarySchema>;
export type UpdatePluginRequest = z.infer<typeof updatePluginRequestSchema>;
export type ApplySetupRequest = z.infer<typeof applySetupRequestSchema>;
