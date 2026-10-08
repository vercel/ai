import type { JSONObject } from '@ai-sdk/provider';
import type { MCPEventsAdapterProvider } from './mcp-events-adapter';
import { z } from 'zod/v4';
import { ResultSchema, type RequestOptions } from './types';

const JsonSchemaSchema = z.union([
  z.boolean(),
  z.record(z.string(), z.unknown()),
]);

export const MCPEventDefinitionSchema = z.looseObject({
  name: z.string().min(1),
  description: z.string().nullish(),
  delivery: z.array(z.enum(['webhook', 'poll', 'push'])).min(1),
  inputSchema: JsonSchemaSchema,
  payloadSchema: JsonSchemaSchema,
});
export type MCPEventDefinition = z.infer<typeof MCPEventDefinitionSchema>;

export const ListEventsResultSchema = ResultSchema.extend({
  events: z.array(MCPEventDefinitionSchema),
  nextCursor: z.string().nullish(),
});
export type ListEventsResult = z.infer<typeof ListEventsResultSchema>;

export const SubscribeEventResultSchema = ResultSchema.extend({
  id: z.string().min(1),
  refreshBefore: z.iso.datetime({ offset: true }).nullable(),
  cursor: z
    .string()
    .nullish()
    .transform(cursor => cursor ?? null),
  truncated: z.boolean(),
});
export type SubscribeEventResult = z.infer<typeof SubscribeEventResultSchema>;

export const MCPEventSchema = z.looseObject({
  eventId: z.string().min(1),
  name: z.string().min(1),
  timestamp: z.iso.datetime({ offset: true }),
  data: z.record(z.string(), z.unknown()),
  cursor: z.string().nullish(),
});
export type MCPEvent = z.infer<typeof MCPEventSchema>;

export const MCPEventControlSchema = z
  .discriminatedUnion('type', [
    z.looseObject({ type: z.literal('gap'), cursor: z.string() }),
    z.looseObject({
      type: z.literal('terminated'),
      error: z.looseObject({
        code: z.number().int(),
        message: z.string(),
        data: z.unknown().nullish(),
      }),
    }),
  ])
  .transform(control =>
    control.type === 'gap' ? { ...control, truncated: true as const } : control,
  );
export type MCPEventControl = z.infer<typeof MCPEventControlSchema>;

/** Persisted privately by the application, including the signing secret. */
export type MCPEventSubscription = {
  key: string;
  id?: string;
  name: string;
  arguments: JSONObject;
  definition: MCPEventDefinition;
  delivery: { mode: 'webhook'; url: string; secret: string };
  refreshBefore?: string | null;
  cursor: string | null;
  truncated: boolean;
  ttlMs?: number | null;
  maxAgeMs?: number;
  status: 'pending' | 'active';
};

/** Subscription metadata safe to pass to event handlers; excludes the secret. */
export type MCPEventSubscriptionInfo = {
  id: string;
  name: string;
  arguments: JSONObject;
  delivery: { mode: 'webhook'; url: string };
  refreshBefore: string | null;
};

/**
 * Use durable, private storage scoped to one MCP server and authenticated
 * principal. update must atomically merge only the supplied fields. Never
 * expose these records to a browser: delivery.secret authenticates webhooks.
 */
export interface MCPEventStore {
  get(key: string): Promise<MCPEventSubscription | undefined>;
  getById(id: string): Promise<MCPEventSubscription | undefined>;
  set(subscription: MCPEventSubscription): Promise<void>;
  update(key: string, patch: Partial<MCPEventSubscription>): Promise<void>;
  delete(key: string): Promise<void>;
}

export type MCPEventsConfig =
  | {
      store: MCPEventStore;
      adapter?: never;
      /**
       * Optionally validate subscription arguments using an application schema or
       * the server's inputSchema. Throw to reject before persisting or subscribing.
       */
      validateArguments?: (args: {
        definition: MCPEventDefinition;
        arguments: JSONObject;
      }) => void | PromiseLike<void>;
    }
  | {
      adapter: MCPEventsAdapterProvider;
      store?: never;
      validateArguments?: never;
    };

export type SubscribeEventOptions = {
  name: string;
  arguments?: JSONObject;
  delivery: {
    mode: 'webhook';
    /** HTTPS callback served by createMCPEventWebhook before subscribing. */
    url: string;
    /** Development only: allow HTTP callbacks to literal loopback addresses. */
    allowInsecureLocalhost?: boolean;
    /** Generated securely when omitted; persisted before the subscribe request. */
    secret?: string;
  };
  cursor?: string | null;
  ttlMs?: number | null;
  maxAgeMs?: number;
  options?: RequestOptions;
};

type MCPEventSubscriptionOptions = (
  | { id: string; key?: never }
  | { key: string; id?: never }
) & { options?: RequestOptions };

export interface MCPEvents {
  list(options?: {
    params?: { cursor?: string };
    options?: RequestOptions;
  }): Promise<ListEventsResult>;
  subscribe(options: SubscribeEventOptions): Promise<SubscribeEventResult>;
  refresh(options: MCPEventSubscriptionOptions): Promise<SubscribeEventResult>;
  unsubscribe(options: MCPEventSubscriptionOptions): Promise<void>;
}
