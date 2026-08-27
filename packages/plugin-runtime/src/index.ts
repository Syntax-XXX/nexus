import { randomUUID } from "node:crypto";
import { realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { Worker } from "node:worker_threads";
import type { DiscordAction, PluginInteraction, PluginMetadata } from "@nexus/plugin-sdk";
import type { HealthState } from "@nexus/shared";
import type { HostRequest, HostRequestWithoutId, HostResponse } from "./protocol.js";

interface PendingRequest {
  readonly resolve: (response: HostResponse) => void;
  readonly reject: (error: Error) => void;
  readonly timer: NodeJS.Timeout;
}

export interface PluginRuntimeOptions {
  readonly pluginRoot: string;
  readonly timeoutMs?: number;
  readonly maxOldGenerationSizeMb?: number;
  readonly maxYoungGenerationSizeMb?: number;
  readonly onHealthChange?: ((pluginId: string, state: HealthState, error?: Error) => void) | undefined;
}

export class PluginRuntime {
  readonly #options: {
    readonly pluginRoot: string;
    readonly timeoutMs: number;
    readonly maxOldGenerationSizeMb: number;
    readonly maxYoungGenerationSizeMb: number;
    readonly onHealthChange: PluginRuntimeOptions["onHealthChange"] | undefined;
  };
  readonly #pending = new Map<string, PendingRequest>();
  #worker: Worker | undefined;
  #metadata: PluginMetadata | undefined;
  #state: HealthState = "disabled";
  #consecutiveFailures = 0;

  constructor(options: PluginRuntimeOptions) {
    this.#options = {
      pluginRoot: options.pluginRoot,
      timeoutMs: options.timeoutMs ?? 10_000,
      maxOldGenerationSizeMb: options.maxOldGenerationSizeMb ?? 128,
      maxYoungGenerationSizeMb: options.maxYoungGenerationSizeMb ?? 32,
      onHealthChange: options.onHealthChange,
    };
  }

  get metadata(): PluginMetadata | undefined { return this.#metadata; }
  get state(): HealthState { return this.#state; }

  async start(entrypoint: string): Promise<PluginMetadata> {
    this.#setState("starting");
    const root = await realpath(this.#options.pluginRoot);
    const entry = await realpath(resolve(root, entrypoint));
    this.#assertInside(root, entry);
    const worker = new Worker(new URL("./worker.js", import.meta.url), {
      resourceLimits: {
        maxOldGenerationSizeMb: this.#options.maxOldGenerationSizeMb,
        maxYoungGenerationSizeMb: this.#options.maxYoungGenerationSizeMb,
        stackSizeMb: 4,
      },
    });
    this.#bindWorker(worker);
    this.#worker = worker;
    try {
      const response = await this.#request({ type: "initialize", moduleUrl: `${pathToFileURL(entry).href}?v=${Date.now()}` });
      if (!response.ok || response.type !== "initialized") throw new Error(response.ok ? "Invalid initialization response" : response.error.message);
      this.#metadata = response.metadata;
      this.#consecutiveFailures = 0;
      this.#setState("healthy");
      return response.metadata;
    } catch (error) {
      await worker.terminate();
      this.#worker = undefined;
      this.#setState("failed", error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  async execute(interaction: PluginInteraction): Promise<readonly DiscordAction[]> {
    if (!this.#worker || !this.#metadata) throw new Error("Plugin is not running");
    try {
      const response = await this.#request({ type: "execute-command", interaction });
      if (!response.ok || response.type !== "command-result") throw new Error(response.ok ? "Invalid command response" : response.error.message);
      this.#consecutiveFailures = 0;
      if (this.#state === "degraded") this.#setState("healthy");
      return response.actions;
    } catch (error) {
      this.#consecutiveFailures += 1;
      this.#setState(this.#consecutiveFailures >= 5 ? "failed" : "degraded", error instanceof Error ? error : new Error(String(error)));
      if (this.#consecutiveFailures >= 5) await this.stop();
      throw error;
    }
  }

  async stop(): Promise<void> {
    const worker = this.#worker;
    if (!worker) return;
    try { await this.#request({ type: "shutdown" }, 5_000); } catch { /* forced termination below */ }
    await worker.terminate();
    this.#worker = undefined;
    this.#metadata = undefined;
    this.#setState("disabled");
  }

  async replace(entrypoint: string): Promise<PluginMetadata> {
    const candidate = new PluginRuntime(this.#options);
    const metadata = await candidate.start(entrypoint);
    const oldWorker = this.#worker;
    candidate.#worker?.removeAllListeners();
    if (candidate.#worker) this.#bindWorker(candidate.#worker);
    this.#worker = candidate.#worker;
    this.#metadata = candidate.#metadata;
    candidate.#worker = undefined;
    this.#setState("healthy");
    if (oldWorker) await oldWorker.terminate();
    return metadata;
  }

  async #request(request: HostRequestWithoutId, timeoutMs = this.#options.timeoutMs): Promise<HostResponse> {
    if (!this.#worker) throw new Error("Plugin worker is unavailable");
    const id = randomUUID();
    return new Promise<HostResponse>((resolvePromise, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error(`Plugin request timed out after ${timeoutMs}ms`));
      }, timeoutMs).unref();
      this.#pending.set(id, { resolve: resolvePromise, reject, timer });
      this.#worker?.postMessage({ ...request, id } as HostRequest);
    });
  }

  #bindWorker(worker: Worker): void {
    worker.on("message", (response: HostResponse) => {
      const pending = this.#pending.get(response.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.#pending.delete(response.id);
      pending.resolve(response);
    });
    worker.on("error", (error) => {
      for (const pending of this.#pending.values()) {
        clearTimeout(pending.timer);
        pending.reject(error);
      }
      this.#pending.clear();
      this.#setState("failed", error);
    });
  }

  #setState(state: HealthState, error?: Error): void {
    this.#state = state;
    this.#options.onHealthChange?.(this.#metadata?.id ?? "unknown", state, error);
  }

  #assertInside(parent: string, child: string): void {
    const path = relative(parent, child);
    if (path === "" || (!path.startsWith(`..${sep}`) && path !== ".." && !isAbsolute(path))) return;
    throw new Error(`Plugin path escapes its allowed directory: ${child}`);
  }
}

export type { HostRequest, HostResponse } from "./protocol.js";
