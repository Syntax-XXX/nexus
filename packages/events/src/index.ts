import { randomUUID } from "node:crypto";

export interface NexusEventMap {
  "guild.config.updated": { guildId: string; key: string; version: number };
  "plugin.enabled": { guildId: string; pluginId: string };
  "plugin.disabled": { guildId: string; pluginId: string };
  "moderation.case.created": { guildId: string; caseId: string; action: string };
  "verification.completed": { guildId: string; userId: string; method: string };
  "ticket.created": { guildId: string; ticketId: string; openerId: string };
  "stream.started": { guildId: string; provider: "twitch" | "youtube"; externalId: string };
}

export interface DomainEvent<K extends keyof NexusEventMap = keyof NexusEventMap> {
  readonly id: string;
  readonly type: K;
  readonly occurredAt: string;
  readonly correlationId: string;
  readonly causationId?: string;
  readonly payload: NexusEventMap[K];
}

type Handler<K extends keyof NexusEventMap> = (event: DomainEvent<K>) => Promise<void> | void;

export class NexusEventBus {
  readonly #handlers = new Map<keyof NexusEventMap, Set<Handler<never>>>();

  on<K extends keyof NexusEventMap>(type: K, handler: Handler<K>): () => void {
    const handlers = this.#handlers.get(type) ?? new Set<Handler<never>>();
    handlers.add(handler as Handler<never>);
    this.#handlers.set(type, handlers);
    return () => handlers.delete(handler as Handler<never>);
  }

  async emit<K extends keyof NexusEventMap>(
    type: K,
    payload: NexusEventMap[K],
    options: { correlationId?: string; causationId?: string } = {},
  ): Promise<DomainEvent<K>> {
    const event: DomainEvent<K> = {
      id: randomUUID(),
      type,
      payload,
      occurredAt: new Date().toISOString(),
      correlationId: options.correlationId ?? randomUUID(),
      ...(options.causationId ? { causationId: options.causationId } : {}),
    };
    const results = [...(this.#handlers.get(type) ?? [])].map((handler) =>
      Promise.resolve((handler as Handler<K>)(event)),
    );
    const settled = await Promise.allSettled(results);
    const rejected = settled.find((result) => result.status === "rejected");
    if (rejected?.status === "rejected") throw rejected.reason;
    return event;
  }
}
