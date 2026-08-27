import pino, { type Logger } from "pino";

const redactedPaths = [
  "authorization",
  "cookie",
  "req.headers.authorization",
  "req.headers.cookie",
  "accessToken",
  "refreshToken",
  "token",
  "secret",
  "*.token",
  "*.secret",
];

export function createLogger(service: string, level = "info"): Logger {
  return pino({
    level,
    base: { service, version: process.env.npm_package_version ?? "0.1.0" },
    redact: { paths: redactedPaths, censor: "[REDACTED]" },
    timestamp: pino.stdTimeFunctions.isoTime,
    serializers: { error: pino.stdSerializers.err, err: pino.stdSerializers.err },
  });
}

export type NexusLogger = Logger;
