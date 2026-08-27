import { describe, expect, it } from "vitest";
import type { ApiEnvironment } from "@nexus/config";
import type { Database } from "@nexus/database";
import { createLogger } from "@nexus/logger";
import { createServer } from "./server.js";

const config: ApiEnvironment = {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/postgres",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "x".repeat(32),
  LOG_LEVEL: "silent",
  TRUSTED_PROXY_CIDRS: "127.0.0.1/32",
  API_HOST: "127.0.0.1",
  API_PORT: 3001,
  DASHBOARD_URL: "https://dashboard.example.com",
  INTERNAL_SIGNING_SECRET: "x".repeat(32),
  TOKEN_ENCRYPTION_KEY: "x".repeat(43),
  OWNER_DISCORD_IDS: "",
};

describe("API health", () => {
  it("serves liveness without requiring database access", async () => {
    const database = { ping: async () => true } as unknown as Database;
    const app = await createServer({ config, database, logger: createLogger("api-test", "silent") });
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: "ok", service: "api" });
    await app.close();
  });
});
