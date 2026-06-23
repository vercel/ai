import {
  harnessV1BridgeInboundCommandSchemas,
  harnessV1BridgeOutboundMessageSchema,
  harnessV1BridgeReadySchema,
  harnessV1BridgeStartBaseSchema,
} from '@ai-sdk/harness';
import { z } from 'zod/v4';

/*
 * Cursor's bridge wire protocol. Outbound events, transport frames, shared
 * inbound commands, and `bridge-ready` come from `@ai-sdk/harness`. The only
 * Cursor-specific piece is the `start` payload.
 */

export const outboundMessageSchema = harnessV1BridgeOutboundMessageSchema;
export type OutboundMessage = z.infer<typeof outboundMessageSchema>;

export const startMessageSchema = harnessV1BridgeStartBaseSchema.extend({
  instructions: z.string().optional(),
  /** Cursor local agent id for cross-process `Agent.resume()`. */
  resumeAgentId: z.string().optional(),
  /** When true, route tool calls through Cursor Auto-review. */
  autoReview: z.boolean().optional(),
});

export type StartMessage = z.infer<typeof startMessageSchema>;

export const inboundMessageSchema = z.discriminatedUnion('type', [
  startMessageSchema,
  ...harnessV1BridgeInboundCommandSchemas,
]);
export type InboundMessage = z.infer<typeof inboundMessageSchema>;

export const bridgeReadySchema = harnessV1BridgeReadySchema;
export type BridgeReady = z.infer<typeof bridgeReadySchema>;
