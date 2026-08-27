import { parentPort } from "node:worker_threads";
import type { NexusPlugin, PluginContext } from "@nexus/plugin-sdk";
import type { HostRequest, HostResponse } from "./protocol.js";

if (!parentPort) throw new Error("Plugin worker requires a parent port");

let plugin: NexusPlugin | undefined;
const controller = new AbortController();
const context: PluginContext = {
  pluginId: "uninitialized",
  signal: controller.signal,
  config: { get: () => Promise.reject(new Error("Plugin config was not provided for this execution")) },
  events: { emit: () => Promise.resolve() },
  logger: {
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
  },
};

function failure(id: string, error: unknown): HostResponse {
  const resolved = error instanceof Error ? error : new Error(String(error));
  return {
    id,
    ok: false,
    error: { name: resolved.name, message: resolved.message, ...(resolved.stack ? { stack: resolved.stack } : {}) },
  };
}

async function handleRequest(request: HostRequest): Promise<void> {
  let response: HostResponse;
  try {
    if (request.type === "initialize") {
      const imported = await import(request.moduleUrl) as { default?: NexusPlugin };
      if (!imported.default) throw new Error("Plugin must default-export a Nexus plugin");
      plugin = imported.default;
      Object.defineProperty(context, "pluginId", { value: plugin.metadata.id });
      await plugin.setup?.(context);
      response = { id: request.id, ok: true, type: "initialized", metadata: plugin.metadata };
    } else if (request.type === "execute-command") {
      if (!plugin) throw new Error("Plugin is not initialized");
      const command = plugin.commands?.find((candidate) => candidate.data.name === request.interaction.commandName);
      if (!command) throw new Error(`Unknown command ${request.interaction.commandName}`);
      const actions = await command.execute(request.interaction, context);
      response = { id: request.id, ok: true, type: "command-result", actions };
    } else {
      controller.abort();
      await plugin?.shutdown?.(context);
      response = { id: request.id, ok: true, type: "shutdown-complete" };
    }
  } catch (error) {
    response = failure(request.id, error);
  }
  parentPort?.postMessage(response);
}

parentPort.on("message", (request: HostRequest) => {
  void handleRequest(request);
});
