import type {
  ChatInputCommandInteraction,
  ClientEvents,
  RESTPostAPIChatInputApplicationCommandsJSONBody,
  SlashCommandStringOption,
} from "discord.js";
import { z } from "zod";
import type { NexusEventMap } from "@nexus/events";

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
  /**
   * Narrow, capability-oriented persistence APIs. Plugins never receive the
   * application's raw database client or connection string.
   */
  readonly database: PluginDatabase;
  readonly events: { emit<K extends keyof NexusEventMap>(type: K, payload: NexusEventMap[K]): Promise<unknown> };
  getGuildConfig<T>(guildId: string, key: string): Promise<T | null>;
}

export interface CreateModerationCaseInput {
  readonly guildId: string;
  readonly action: string;
  readonly targetUserId: string;
  readonly moderatorUserId: string;
  readonly reason?: string;
  readonly durationSeconds?: number;
  readonly evidence?: Readonly<Record<string, unknown>>;
  readonly expiresAt?: string;
}

export interface ModerationCaseRecord {
  readonly id: string;
  readonly caseNumber: number;
  readonly action: string;
  readonly targetUserId: string;
  readonly moderatorUserId: string;
  readonly reason: string | null;
  readonly createdAt: string;
}

export interface WarningRecord {
  readonly id: string;
  readonly caseId: string;
  readonly caseNumber: number;
  readonly userId: string;
  readonly moderatorUserId: string;
  readonly reason: string;
  readonly createdAt: string;
}

export interface ModerationCaseDetails extends ModerationCaseRecord {
  readonly durationSeconds: number | null;
  readonly expiresAt: string | null;
  readonly active: boolean;
}

export interface PluginDatabase {
  createModerationCase(input: CreateModerationCaseInput): Promise<ModerationCaseRecord>;
  createWarning(input: {
    readonly guildId: string;
    readonly userId: string;
    readonly moderatorUserId: string;
    readonly reason: string;
  }): Promise<WarningRecord>;
  listWarnings(guildId: string, userId: string): Promise<readonly WarningRecord[]>;
  getModerationCase(guildId: string, caseNumber: number): Promise<ModerationCaseDetails | null>;
}

export interface PluginCommand {
  readonly data: RESTPostAPIChatInputApplicationCommandsJSONBody;
  readonly permission?: string;
  readonly cooldownSeconds?: number;
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
