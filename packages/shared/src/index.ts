import { z } from "zod";

export const discordSnowflakeSchema = z.string().regex(/^\d{17,20}$/);
export const localeSchema = z.enum(["en", "de"]);
export const maturitySchema = z.enum(["stable", "beta", "experimental", "disabled"]);
export const healthSchema = z.enum([
  "enabled",
  "disabled",
  "starting",
  "healthy",
  "degraded",
  "failed",
  "incompatible",
]);

export type Locale = z.infer<typeof localeSchema>;
export type FeatureMaturity = z.infer<typeof maturitySchema>;
export type HealthState = z.infer<typeof healthSchema>;

export interface PageInfo {
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
}

export interface Page<T> {
  readonly items: readonly T[];
  readonly pageInfo: PageInfo;
}

export interface RequestContext {
  readonly requestId: string;
  readonly actorId?: string;
  readonly guildId?: string;
}

export function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${String(value)}`);
}
