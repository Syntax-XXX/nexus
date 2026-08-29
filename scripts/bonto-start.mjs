import { spawn } from "node:child_process";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const service = process.argv[2] ?? "bot";
const services = {
  bot: {
    entrypoint: "apps/bot/dist/main.js",
    build: ["@nexus/events", "@nexus/logger", "@nexus/plugin-api", "@nexus/plugin-loader", "@nexus/database", "@nexus/config", "@nexus/plugin-ping", "@nexus/plugin-moderation", "@nexus/bot"],
  },
  api: {
    entrypoint: "apps/api/dist/main.js",
    build: ["@nexus/shared", "@nexus/events", "@nexus/logger", "@nexus/config", "@nexus/plugin-api", "@nexus/database", "@nexus/api-contract", "@nexus/api"],
  },
  worker: {
    entrypoint: "apps/worker/dist/main.js",
    build: ["@nexus/events", "@nexus/logger", "@nexus/config", "@nexus/plugin-api", "@nexus/database", "@nexus/worker"],
  },
};
const target = services[service];
if (!target) throw new Error(`Unknown Bonto service: ${service}`);

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", env: process.env });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) reject(new Error(`${command} terminated by ${signal}`));
      else if (code !== 0) reject(new Error(`${command} exited with code ${code ?? "unknown"}`));
      else resolve();
    });
  });
}

for (const workspace of target.build) {
  await run(npmCommand, ["run", "build", `--workspace=${workspace}`]);
}
const processChild = spawn(process.execPath, [target.entrypoint], { stdio: "inherit", env: process.env });
const forwardSignal = (signal) => processChild.kill(signal);
process.once("SIGINT", () => forwardSignal("SIGINT"));
process.once("SIGTERM", () => forwardSignal("SIGTERM"));
await new Promise((resolve, reject) => {
  processChild.once("error", reject);
  processChild.once("exit", (code, signal) => {
    if (signal) reject(new Error(`${service} terminated by ${signal}`));
    else if (code !== 0) reject(new Error(`${service} exited with code ${code ?? "unknown"}`));
    else resolve();
  });
});
