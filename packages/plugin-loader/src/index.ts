import { readFile, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import type { Client, ClientEvents } from "discord.js";
import {
  pluginManifestSchema,
  type DiscordPlugin,
  type PluginContext,
  type PluginFactory,
  type PluginManifest,
} from "@nexus/plugin-api";

export interface LoadedPlugin {
  manifest: PluginManifest;
  instance: DiscordPlugin;
  context: PluginContext;
  abortController: AbortController;
  listeners: Array<{ event: keyof ClientEvents; listener: (...args: unknown[]) => void }>;
}

export interface PluginLoaderOptions {
  client: Client;
  pluginRoot: string;
  logger: PluginContext["logger"];
  getGuildConfig<T>(guildId: string, key: string): Promise<T | null>;
}

export class PluginLoader {
  readonly #plugins = new Map<string, LoadedPlugin>();
  readonly #options: PluginLoaderOptions;

  constructor(options: PluginLoaderOptions) {
    this.#options = options;
  }

  get loadedPlugins(): ReadonlyMap<string, LoadedPlugin> {
    return this.#plugins;
  }

  async load(pluginDirectory: string): Promise<DiscordPlugin> {
    const root = await realpath(this.#options.pluginRoot);
    const directory = await realpath(resolve(root, pluginDirectory));
    this.#assertInside(root, directory);

    const rawManifest: unknown = JSON.parse(await readFile(join(directory, "plugin.manifest.json"), "utf8")) as unknown;
    const manifest = pluginManifestSchema.parse(rawManifest);
    if (this.#plugins.has(manifest.id)) {
      throw new Error(`Plugin ${manifest.id} is already loaded`);
    }

    const entrypoint = await realpath(join(directory, manifest.entrypoint));
    this.#assertInside(directory, entrypoint);

    const abortController = new AbortController();
    const context: PluginContext = {
      manifest,
      logger: this.#options.logger,
      signal: abortController.signal,
      getGuildConfig: <T>(guildId: string, key: string) => this.#options.getGuildConfig<T>(guildId, key),
    };

    const moduleUrl = `${pathToFileURL(entrypoint).href}?v=${Date.now()}`;
    const module = await import(moduleUrl) as { default?: PluginFactory };
    if (typeof module.default !== "function") {
      throw new TypeError(`${manifest.id} must default-export a plugin factory`);
    }

    const instance = await module.default(context);
    const listeners: LoadedPlugin["listeners"] = [];
    const eventClient = this.#options.client as unknown as {
      on(name: string, listener: (...args: unknown[]) => void): void;
      once(name: string, listener: (...args: unknown[]) => void): void;
      off(name: string, listener: (...args: unknown[]) => void): void;
    };
    try {
      for (const event of instance.events ?? []) {
        // Discord event signatures are a union after runtime registration; the
        // manifest schema has already constrained the event name.
        // eslint-disable-next-line @typescript-eslint/unbound-method
        const execute = event.execute as (...args: unknown[]) => Promise<void> | void;
        const listener = (...args: unknown[]) => {
          Promise.resolve(execute(...args)).catch((error: unknown) => {
            context.logger.error({ error, pluginId: manifest.id, event: event.name }, "Plugin event failed");
          });
        };
        if (event.once) eventClient.once(event.name, listener);
        else eventClient.on(event.name, listener);
        listeners.push({ event: event.name, listener });
      }
      await instance.onLoad?.(context);
      this.#plugins.set(manifest.id, { manifest, instance, context, abortController, listeners });
      context.logger.info({ pluginId: manifest.id, version: manifest.version }, "Plugin loaded");
      return instance;
    } catch (error) {
      abortController.abort();
      for (const item of listeners) eventClient.off(item.event, item.listener);
      throw error;
    }
  }

  async unload(pluginId: string): Promise<void> {
    const loaded = this.#plugins.get(pluginId);
    if (!loaded) return;
    loaded.abortController.abort();
    const eventClient = this.#options.client as unknown as {
      off(name: string, listener: (...args: unknown[]) => void): void;
    };
    for (const item of loaded.listeners) eventClient.off(item.event, item.listener);
    try {
      await loaded.instance.onUnload?.(loaded.context);
    } finally {
      this.#plugins.delete(pluginId);
      loaded.context.logger.info({ pluginId }, "Plugin unloaded");
    }
  }

  async unloadAll(): Promise<void> {
    await Promise.allSettled([...this.#plugins.keys()].map((id) => this.unload(id)));
  }

  #assertInside(parent: string, child: string): void {
    const path = relative(parent, child);
    if (path === "" || (!path.startsWith(`..${sep}`) && path !== ".." && !isAbsolute(path))) return;
    throw new Error(`Plugin path escapes its allowed directory: ${child}`);
  }
}
