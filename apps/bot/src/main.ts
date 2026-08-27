import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import {
  Client,
  Collection,
  Events,
  GatewayIntentBits,
  REST,
  Routes,
  type ChatInputCommandInteraction,
} from "discord.js";
import { createDatabase } from "@nexus/database";
import type { PluginCommand } from "@nexus/plugin-api";
import { PluginLoader } from "@nexus/plugin-loader";
import { createLogger } from "@nexus/logger";
import { loadConfig } from "./config.js";
import { startHealthServer } from "./health.js";

const config = loadConfig();
const logger = createLogger("bot", config.LOG_LEVEL);

const database = createDatabase(config.DATABASE_URL);
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const commands = new Collection<string, { command: PluginCommand; pluginId: string }>();
const pluginRoot = resolve(process.cwd(), config.PLUGIN_DIRECTORY);
const loader = new PluginLoader({
  client,
  pluginRoot,
  logger,
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

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const entry = commands.get(interaction.commandName);
  if (!entry) return;

  try {
    const loaded = loader.loadedPlugins.get(entry.pluginId);
    if (!loaded) throw new Error(`Plugin ${entry.pluginId} is not loaded`);
    await entry.command.execute(interaction as ChatInputCommandInteraction, loaded.context);
  } catch (error) {
    logger.error({ error, command: interaction.commandName, guildId: interaction.guildId }, "Command failed");
    const response = { content: "Beim Ausführen des Befehls ist ein Fehler aufgetreten.", ephemeral: true };
    if (interaction.deferred || interaction.replied) await interaction.followUp(response).catch(() => undefined);
    else await interaction.reply(response).catch(() => undefined);
  }
});

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "Shutting down");
  const forceTimer = setTimeout(() => process.exit(1), 10_000).unref();
  await loader.unloadAll();
  client.destroy();
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
