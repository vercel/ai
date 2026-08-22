import {
  harnessV1BridgeInboundCommandSchemas,
  harnessV1BridgeOutboundMessageSchema,
  harnessV1BridgeReadySchema,
  harnessV1BridgeStartBaseSchema,
} from '@ai-sdk/harness';
import { z } from 'zod/v4';

export const outboundMessageSchema = harnessV1BridgeOutboundMessageSchema;
export type OutboundMessage = z.infer<typeof outboundMessageSchema>;

/**
 * One OpenCode sync event as returned by `POST /sync/history`. Rounded to the
 * fields `POST /sync/replay` needs (plus the `aggregate_id` → `aggregateID`
 * rename the replay request requires).
 */
export const openCodeSyncEventSchema = z.looseObject({
  id: z.string(),
  aggregate_id: z.string(),
  seq: z.number(),
  type: z.string(),
  data: z.record(z.string(), z.unknown()),
});

export type OpenCodeSyncEvent = z.infer<typeof openCodeSyncEventSchema>;

export const startMessageSchema = harnessV1BridgeStartBaseSchema.extend({
  operation: z.enum(['prompt', 'compact']).optional(),
  provider: z.string().optional(),
  variant: z.string().optional(),
  instructions: z.string().optional(),
  resumeSessionId: z.string().optional(),
  mcpServers: z.record(z.string(), z.unknown()).optional(),
  /**
   * One-shot: present only on the first `start` after
   * `doStart({ importFrom })`. The bridge replays these events into the
   * OpenCode server before resolving the session, reconstructing the exported
   * conversation in this sandbox.
   */
  importEvents: z.array(openCodeSyncEventSchema).optional(),
});

export type StartMessage = z.infer<typeof startMessageSchema>;

export const inboundMessageSchema = z.discriminatedUnion('type', [
  startMessageSchema,
  ...harnessV1BridgeInboundCommandSchemas,
]);
export type InboundMessage = z.infer<typeof inboundMessageSchema>;

export const bridgeReadySchema = harnessV1BridgeReadySchema;
export type BridgeReady = z.infer<typeof bridgeReadySchema>;
