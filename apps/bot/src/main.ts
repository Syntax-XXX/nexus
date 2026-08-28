import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import {
  Client,
  Collection,
  Events,
  GatewayIntentBits,
  REST,
  Routes,
  PermissionsBitField,
  type ChatInputCommandInteraction,
  type Interaction,
} from "discord.js";
import { createDatabase } from "@nexus/database";
import { NexusEventBus } from "@nexus/events";
import type { PluginCommand } from "@nexus/plugin-api";
import { PluginLoader } from "@nexus/plugin-loader";
import { createLogger } from "@nexus/logger";
import { loadConfig } from "./config.js";
import { startHealthServer } from "./health.js";

const config = loadConfig();
const logger = createLogger("bot", config.LOG_LEVEL);

const database = createDatabase(config.DATABASE_URL);
const eventBus = new NexusEventBus();
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const commands = new Collection<string, { command: PluginCommand; pluginId: string }>();
const pluginRoot = resolve(process.cwd(), config.PLUGIN_DIRECTORY);
const loader = new PluginLoader({
  client,
  pluginRoot,
  logger,
  database,
  events: eventBus,
  getGuildConfig: (guildId, key) => database.getGuildConfig(guildId, key),
});
const healthServer = await startHealthServer(config.PORT, {
  isDiscordReady: () => client.isReady(),
  isDatabaseReady: () => database.ping(),
});
logger.info({ port: config.PORT }, "Health server listening");

async function discoverPlugins(): Promise<string[]> {
  const entries = await readdir(pluginRoot, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
}

async function loadPlugins(): Promise<void> {
  for (const directory of await discoverPlugins()) {
    try {
      const plugin = await loader.load(directory);
      const loaded = [...loader.loadedPlugins.values()].find((item) => item.instance === plugin);
      if (!loaded) throw new Error("Loaded plugin was not registered");
      for (const command of plugin.commands ?? []) {
        if (commands.has(command.data.name)) {
          throw new Error(`Duplicate command name: ${command.data.name}`);
        }
        commands.set(command.data.name, { command, pluginId: loaded.manifest.id });
      }
    } catch (error) {
      logger.error({ error, directory }, "Plugin could not be loaded");
    }
  }
}

async function registerCommands(): Promise<void> {
  const body = commands.map(({ command }) => command.data);
  const rest = new REST({ version: "10" }).setToken(config.DISCORD_TOKEN);
  const route = config.DISCORD_DEV_GUILD_ID
    ? Routes.applicationGuildCommands(config.DISCORD_CLIENT_ID, config.DISCORD_DEV_GUILD_ID)
    : Routes.applicationCommands(config.DISCORD_CLIENT_ID);
  await rest.put(route, { body });
  logger.info({ commandCount: body.length, scope: config.DISCORD_DEV_GUILD_ID ? "guild" : "global" }, "Commands registered");
}

client.once(Events.ClientReady, (readyClient) => {
  logger.info({ user: readyClient.user.tag, guildCount: readyClient.guilds.cache.size }, "Bot ready");
});

client.on(Events.GuildCreate, (guild) => {
  void database.ensureGuild({ id: guild.id, name: guild.name, iconHash: guild.icon, ownerId: guild.ownerId })
    .then(() => logger.info({ guildId: guild.id, name: guild.name }, "Guild registered"))
    .catch((error: unknown) => logger.error({ error, guildId: guild.id }, "Guild registration failed"));
});

const nexusPermissionToDiscord = {
  "nexus.moderation.warn": PermissionsBitField.Flags.ModerateMembers,
  "nexus.moderation.kick": PermissionsBitField.Flags.KickMembers,
  "nexus.moderation.ban": PermissionsBitField.Flags.BanMembers,
  "nexus.moderation.timeout": PermissionsBitField.Flags.ModerateMembers,
  "nexus.moderation.purge": PermissionsBitField.Flags.ManageMessages,
  "nexus.moderation.view": PermissionsBitField.Flags.ModerateMembers,
} as const;

async function authorizeCommand(interaction: ChatInputCommandInteraction, permission?: string): Promise<boolean> {
  if (!permission) return true;
  const required = nexusPermissionToDiscord[permission as keyof typeof nexusPermissionToDiscord];
  const allowed = Boolean(required && interaction.inGuild() && interaction.memberPermissions?.has(required));
  if (allowed) return true;
  await interaction.reply({ content: "Dir fehlen die erforderlichen Discord-Berechtigungen für diesen Befehl.", ephemeral: true }).catch(() => undefined);
  logger.warn({ command: interaction.commandName, guildId: interaction.guildId, userId: interaction.user.id, permission }, "Command authorization denied");
  return false;
}

async function handleInteraction(interaction: Interaction): Promise<void> {
  if (!interaction.isChatInputCommand()) return;
  const entry = commands.get(interaction.commandName);
  if (!entry) return;

  try {
    if (!(await authorizeCommand(interaction, entry.command.permission))) return;
    if (interaction.guildId && !(await database.isPluginEnabled(interaction.guildId, entry.pluginId))) {
      await interaction.reply({ content: "Dieses Nexus-Modul ist auf diesem Server deaktiviert.", ephemeral: true });
      return;
    }
    const loaded = loader.loadedPlugins.get(entry.pluginId);
    if (!loaded) throw new Error(`Plugin ${entry.pluginId} is not loaded`);
    await entry.command.execute(interaction, loaded.context);
  } catch (error) {
    logger.error({ error, command: interaction.commandName, guildId: interaction.guildId }, "Command failed");
    const response = { content: "Beim Ausführen des Befehls ist ein Fehler aufgetreten.", ephemeral: true };
    if (interaction.deferred || interaction.replied) await interaction.followUp(response).catch(() => undefined);
    else await interaction.reply(response).catch(() => undefined);
  }
}

client.on(Events.InteractionCreate, (interaction) => {
  void handleInteraction(interaction);
});

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "Shutting down");
  const forceTimer = setTimeout(() => process.exit(1), 10_000).unref();
  await loader.unloadAll();
  await client.destroy();
  await new Promise<void>((resolvePromise) => healthServer.close(() => resolvePromise()));
  await database.close();
  clearTimeout(forceTimer);
}

process.once("SIGINT", () => void shutdown("SIGINT").then(() => process.exit(0)));
process.once("SIGTERM", () => void shutdown("SIGTERM").then(() => process.exit(0)));
process.on("unhandledRejection", (error) => logger.error({ error }, "Unhandled rejection"));
process.on("uncaughtException", (error) => {
  logger.fatal({ error }, "Uncaught exception");
  void shutdown("uncaughtException").finally(() => process.exit(1));
});

await loadPlugins();
await registerCommands();
await client.login(config.DISCORD_TOKEN);
