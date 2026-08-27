import { describe, expect, it } from "vitest";
import { EnvironmentValidationError, botEnvironmentSchema, parseEnvironment } from "./index.js";

describe("environment validation", () => {
  it("reports missing secret names without exposing values", () => {
    expect(() => parseEnvironment(botEnvironmentSchema, {})).toThrow(EnvironmentValidationError);
    try {
      parseEnvironment(botEnvironmentSchema, { DISCORD_TOKEN: "super-secret" });
    } catch (error) {
      expect(String(error)).not.toContain("super-secret");
    }
  });
});
