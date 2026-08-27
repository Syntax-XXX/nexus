import { describe, expect, it, vi } from "vitest";
import { NexusEventBus } from "./index.js";

describe("NexusEventBus", () => {
  it("delivers typed events and supports unsubscribe", async () => {
    const bus = new NexusEventBus();
    const handler = vi.fn();
    const unsubscribe = bus.on("plugin.enabled", handler);
    await bus.emit("plugin.enabled", { guildId: "123", pluginId: "verification" });
    unsubscribe();
    await bus.emit("plugin.enabled", { guildId: "123", pluginId: "moderation" });
    expect(handler).toHaveBeenCalledOnce();
  });
});
