import { createServer, type Server } from "node:http";

export interface HealthChecks {
  readonly isDiscordReady: () => boolean;
  readonly isDatabaseReady: () => Promise<boolean>;
}

export function startHealthServer(port: number, checks: HealthChecks): Promise<Server> {
  const server = createServer((request, response) => {
    response.setHeader("content-type", "application/json; charset=utf-8");
    response.setHeader("cache-control", "no-store");
    if (request.url === "/health") {
      response.statusCode = 200;
      response.end(JSON.stringify({ status: "ok", service: "bot" }));
      return;
    }
    if (request.url === "/ready") {
      void checks.isDatabaseReady().then((database) => {
        const discord = checks.isDiscordReady();
        response.statusCode = discord && database ? 200 : 503;
        response.end(JSON.stringify({ status: discord && database ? "ready" : "not_ready", discord, database }));
      }).catch(() => {
        response.statusCode = 503;
        response.end(JSON.stringify({ status: "not_ready", discord: checks.isDiscordReady(), database: false }));
      });
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ status: "not_found" }));
  });
  return new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(port, "0.0.0.0", () => {
      server.off("error", reject);
      resolvePromise(server);
    });
  });
}
