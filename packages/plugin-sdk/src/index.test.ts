import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineNexusPlugin } from "./index.js";

describe("defineNexusPlugin", () => {
  it("validates plugin metadata", () => {
    const plugin = defineNexusPlugin({
      metadata: {
        id: "verification",
        name: "Verification",
        version: "1.0.0",
        apiVersion: 1,
        description: "Verifies new guild members",
        author: "Nexus",
        category: "security",
        maturity: "beta",
        permissions: [],
        requiredIntents: ["GuildMembers"],
        capabilities: ["roles.manage"],
        dependencies: {},
        optionalDependencies: {},
      },
      configSchema: z.object({ roleId: z.string() }),
    });
    expect(plugin.metadata.id).toBe("verification");
  });
});
