import type {
  ChatInputCommandInteraction,
  ClientEvents,
  RESTPostAPIChatInputApplicationCommandsJSONBody,
} from "discord.js";
import { z } from "zod";

export const pluginManifestSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9.-]{2,63}$/),
  name: z.string().min(1).max(80),
  version: z.string().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/),
  author: z.string().min(1).max(100),
  description: z.string().max(500).default(""),
  entrypoint: z.string().regex(/^(?!\/)(?!.*\.\.)(?!.*\\).+\.js$/),
  apiVersion: z.literal(1),
  dependencies: z.record(z.string(), z.string()).default({}),
  capabilities: z.array(z.enum([
    "commands.register",
    "messages.send",
    "guilds.read",
    "members.moderate",
    "roles.manage",
    "voice.connect",
    "storage.read",
    "storage.write",
  ])).default([]),
});

export type PluginManifest = z.infer<typeof pluginManifestSchema>;

export interface PluginLogger {
  debug(data: unknown, message?: string): void;
  info(data: unknown, message?: string): void;
  warn(data: unknown, message?: string): void;
  error(data: unknown, message?: string): void;
}

export interface PluginContext {
  readonly manifest: PluginManifest;
  readonly logger: PluginLogger;
  readonly signal: AbortSignal;
  getGuildConfig<T>(guildId: string, key: string): Promise<T | null>;
}

export interface PluginCommand {
  readonly data: RESTPostAPIChatInputApplicationCommandsJSONBody;
  execute(interaction: ChatInputCommandInteraction, context: PluginContext): Promise<void>;
}

export interface PluginEvent<K extends keyof ClientEvents = keyof ClientEvents> {
  readonly name: K;
  readonly once?: boolean;
  execute(...args: ClientEvents[K]): Promise<void> | void;
}

export interface DiscordPlugin {
  readonly commands?: readonly PluginCommand[];
  readonly events?: readonly PluginEvent[];
  onLoad?(context: PluginContext): Promise<void> | void;
  onUnload?(context: PluginContext): Promise<void> | void;
}

export type PluginFactory = (context: PluginContext) => DiscordPlugin | Promise<DiscordPlugin>;

export function definePlugin(factory: PluginFactory): PluginFactory {
  return factory;
}
