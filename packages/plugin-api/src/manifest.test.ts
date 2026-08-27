import { describe, expect, it } from "vitest";
import { pluginManifestSchema } from "./index.js";

describe("pluginManifestSchema", () => {
  it("accepts a safe manifest", () => {
    expect(pluginManifestSchema.parse({
      id: "core.ping",
      name: "Ping",
      version: "1.0.0",
      author: "Core Team",
      entrypoint: "dist/index.js",
      apiVersion: 1,
    }).capabilities).toEqual([]);
  });

  it("rejects traversal entrypoints", () => {
    expect(() => pluginManifestSchema.parse({
      id: "bad.plugin",
      name: "Bad",
      version: "1.0.0",
      author: "Nobody",
      entrypoint: "../index.js",
      apiVersion: 1,
    })).toThrow();
  });
});
