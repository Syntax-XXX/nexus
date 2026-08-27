import type { RESTPostAPIChatInputApplicationCommandsJSONBody } from "discord-api-types/v10";
import { z } from "zod";
import type { NexusEventMap } from "@nexus/events";
import { maturitySchema } from "@nexus/shared";

export const pluginCapabilitySchema = z.enum([
  "commands.register",
  "messages.read",
  "messages.send",
  "messages.delete",
  "guilds.read",
  "members.read",
  "members.moderate",
  "roles.manage",
  "channels.manage",
  "storage.read",
  "storage.write",
  "integrations.call",
  "jobs.schedule",
]);

export const pluginMetadataSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]{2,63}$/),
  name: z.string().min(1).max(80),
  version: z.string().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/),
  apiVersion: z.literal(1),
  description: z.string().max(500),
  author: z.string().min(1).max(100),
  category: z.string().min(1).max(50),
  maturity: maturitySchema.default("beta"),
  permissions: z.array(z.string()).default([]),
  requiredIntents: z.array(z.string()).default([]),
  capabilities: z.array(pluginCapabilitySchema).default([]),
  dependencies: z.record(z.string(), z.string()).default({}),
  optionalDependencies: z.record(z.string(), z.string()).default({}),
});

export type PluginMetadata = z.infer<typeof pluginMetadataSchema>;

export interface PluginInteraction {
  readonly id: string;
  readonly commandName: string;
  readonly guildId: string;
  readonly channelId: string;
  readonly userId: string;
  readonly locale: string;
  readonly options: Readonly<Record<string, unknown>>;
}

export type DiscordAction =
  | { readonly type: "reply"; readonly content: string; readonly ephemeral?: boolean }
  | { readonly type: "assign-role"; readonly guildId: string; readonly userId: string; readonly roleId: string }
  | { readonly type: "remove-role"; readonly guildId: string; readonly userId: string; readonly roleId: string }
  | { readonly type: "timeout"; readonly guildId: string; readonly userId: string; readonly until: string; readonly reason?: string }
  | { readonly type: "kick"; readonly guildId: string; readonly userId: string; readonly reason?: string }
  | { readonly type: "ban"; readonly guildId: string; readonly userId: string; readonly reason?: string };

export interface PluginCommand {
  readonly data: RESTPostAPIChatInputApplicationCommandsJSONBody;
  readonly permission?: string;
  readonly cooldownSeconds?: number;
  execute(interaction: PluginInteraction, context: PluginContext): Promise<readonly DiscordAction[]>;
}

export interface PluginContext {
  readonly pluginId: string;
  readonly signal: AbortSignal;
  readonly config: { get<T>(guildId: string): Promise<T> };
  readonly events: { emit<K extends keyof NexusEventMap>(type: K, payload: NexusEventMap[K]): Promise<void> };
  readonly logger: {
    debug(data: unknown, message?: string): void;
    info(data: unknown, message?: string): void;
    warn(data: unknown, message?: string): void;
    error(data: unknown, message?: string): void;
  };
}

export interface NexusPlugin<TConfig extends z.ZodType = z.ZodType> {
  readonly metadata: PluginMetadata;
  readonly configSchema: TConfig;
  readonly commands?: readonly PluginCommand[];
  setup?(context: PluginContext): Promise<void> | void;
  shutdown?(context: PluginContext): Promise<void> | void;
}

export function defineNexusPlugin<TConfig extends z.ZodType>(plugin: NexusPlugin<TConfig>): NexusPlugin<TConfig> {
  pluginMetadataSchema.parse(plugin.metadata);
  return plugin;
}
