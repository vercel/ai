import { z } from 'zod/v4';
import { ResultSchema } from './types';

// MCP Events is a draft extension. Keep its schemas separate from the base protocol.
// https://github.com/modelcontextprotocol/experimental-ext-triggers-events/blob/main/docs/design-sketch-proposal.md
export const MCPEventSchema = z.looseObject({
  name: z.string(),
  description: z.string().optional(),
  delivery: z.array(z.enum(['poll', 'push', 'webhook'])).min(1),
  inputSchema: z.looseObject({}),
  payloadSchema: z.looseObject({}),
  _meta: z.record(z.string(), z.unknown()).optional(),
});

export type MCPEvent = z.infer<typeof MCPEventSchema>;

export const ListEventsResultSchema = ResultSchema.extend({
  events: z.array(MCPEventSchema),
  nextCursor: z.string().optional(),
});

export type ListEventsResult = z.infer<typeof ListEventsResultSchema>;

const CallbackUrlSchema = z.url({ protocol: /^https$/ });

function isWebhookSecret(value: string): boolean {
  if (!value.startsWith('whsec_')) return false;
  try {
    const encoded = value.slice(6);
    const decoded = atob(encoded);
    return (
      decoded.length >= 24 && decoded.length <= 64 && btoa(decoded) === encoded
    );
  } catch {
    return false;
  }
}

/** Generate a Standard Webhooks secret before registering the callback receiver. */
export function generateMCPWebhookSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `whsec_${btoa(String.fromCharCode(...bytes))}`;
}

export const UnsubscribeEventParamsSchema = z.object({
  name: z.string(),
  arguments: z.record(z.string(), z.unknown()).optional(),
  delivery: z.object({ url: CallbackUrlSchema }),
  _meta: z.record(z.string(), z.unknown()).optional(),
});

export type UnsubscribeEventParams = z.infer<
  typeof UnsubscribeEventParamsSchema
>;

export const SubscribeEventParamsSchema = UnsubscribeEventParamsSchema.extend({
  delivery: z.object({
    url: CallbackUrlSchema,
    secret: z
      .string()
      .refine(
        isWebhookSecret,
        'Expected a Standard Webhooks secret encoding 24–64 random bytes',
      ),
  }),
  cursor: z.string().nullable().optional(),
  maxAgeMs: z.number().int().nonnegative().optional(),
  ttlMs: z.number().int().nonnegative().nullable().optional(),
});

export type SubscribeEventParams = z.infer<typeof SubscribeEventParamsSchema>;

export const SubscribeEventResultSchema = ResultSchema.extend({
  id: z.string(),
  refreshBefore: z.iso.datetime({ offset: true }).nullable(),
  // Missing cursors have the same meaning as null in the draft.
  cursor: z
    .string()
    .nullish()
    .transform(value => value ?? null),
  truncated: z.boolean().optional(),
  deliveryStatus: z
    .looseObject({
      active: z.boolean(),
      lastDeliveryAt: z.iso.datetime({ offset: true }).nullish(),
      lastError: z
        .enum([
          'connection_refused',
          'timeout',
          'tls_error',
          'http_4xx',
          'http_5xx',
          'challenge_failed',
        ])
        .nullish(),
      failedSince: z.iso.datetime({ offset: true }).nullish(),
      throttled: z.boolean().optional(),
      retryAfterMs: z.number().int().nonnegative().optional(),
    })
    .optional(),
});

export type SubscribeEventResult = z.infer<typeof SubscribeEventResultSchema>;
