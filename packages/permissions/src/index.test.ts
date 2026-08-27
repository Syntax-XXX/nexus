import { describe, expect, it } from "vitest";
import { evaluatePermission } from "./index.js";

describe("evaluatePermission", () => {
  it("makes explicit denies override wildcard allows", () => {
    const result = evaluatePermission("nexus.moderation.ban", [
      { permission: "nexus.moderation.*", effect: "allow", source: "role" },
      { permission: "nexus.moderation.ban", effect: "deny", source: "user" },
    ]);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("explicit-deny");
  });
});
