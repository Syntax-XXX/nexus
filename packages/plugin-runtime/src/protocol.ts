import type { DiscordAction, PluginInteraction, PluginMetadata } from "@nexus/plugin-sdk";

export type HostRequest =
  | { readonly id: string; readonly type: "initialize"; readonly moduleUrl: string }
  | { readonly id: string; readonly type: "execute-command"; readonly interaction: PluginInteraction }
  | { readonly id: string; readonly type: "shutdown" };

export type HostRequestWithoutId =
  | { readonly type: "initialize"; readonly moduleUrl: string }
  | { readonly type: "execute-command"; readonly interaction: PluginInteraction }
  | { readonly type: "shutdown" };

export type HostResponse =
  | { readonly id: string; readonly ok: true; readonly type: "initialized"; readonly metadata: PluginMetadata }
  | { readonly id: string; readonly ok: true; readonly type: "command-result"; readonly actions: readonly DiscordAction[] }
  | { readonly id: string; readonly ok: true; readonly type: "shutdown-complete" }
  | { readonly id: string; readonly ok: false; readonly error: { readonly name: string; readonly message: string; readonly stack?: string } };
