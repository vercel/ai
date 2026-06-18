import {
  harnessV1BridgeInboundCommandSchemas,
  harnessV1BridgeOutboundMessageSchema,
  harnessV1BridgeReadySchema,
  harnessV1BridgeStartBaseSchema,
} from '@ai-sdk/harness';
import { z } from 'zod/v4';

/*
 * DeepAgents' bridge wire protocol. The outbound events, transport frames,
 * shared inbound commands, and `bridge-ready` line all come from the shared
 * `@ai-sdk/harness` protocol — the only DeepAgents-specific piece is the
 * `start` payload.
 */

export const outboundMessageSchema = harnessV1BridgeOutboundMessageSchema;
export type OutboundMessage = z.infer<typeof outboundMessageSchema>;

export const startMessageSchema = harnessV1BridgeStartBaseSchema.extend({
  /*
   * Free-form session instructions. `create_deep_agent()` takes no
   * `instructions` parameter, so the bridge prepends this to the first user
   * message of a fresh session. The host sends it only on the first turn.
   */
  instructions: z.string().optional(),
});

export type StartMessage = z.infer<typeof startMessageSchema>;

export const inboundMessageSchema = z.discriminatedUnion('type', [
  startMessageSchema,
  ...harnessV1BridgeInboundCommandSchemas,
]);
export type InboundMessage = z.infer<typeof inboundMessageSchema>;

export const bridgeReadySchema = harnessV1BridgeReadySchema;
export type BridgeReady = z.infer<typeof bridgeReadySchema>;
