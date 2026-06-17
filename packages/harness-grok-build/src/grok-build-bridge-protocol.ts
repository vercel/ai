import {
  harnessV1BridgeInboundCommandSchemas,
  harnessV1BridgeOutboundMessageSchema,
  harnessV1BridgeReadySchema,
  harnessV1BridgeStartBaseSchema,
} from '@ai-sdk/harness';
import { z } from 'zod/v4';

/*
 * Grok Build's bridge wire protocol. The outbound events, transport frames,
 * shared inbound commands, and `bridge-ready` line all come from the shared
 * `@ai-sdk/harness` protocol. The only Grok-specific piece is the `start`
 * payload, which carries Grok CLI configuration.
 */

export const outboundMessageSchema = harnessV1BridgeOutboundMessageSchema;
export type OutboundMessage = z.infer<typeof outboundMessageSchema>;

export const startMessageSchema = harnessV1BridgeStartBaseSchema.extend({
  model: z.string().optional(),
  // Grok Build's plan-first execution loop.
  planMode: z.boolean().optional(),
  // Resume signal. When true, the bridge resumes the prior CLI thread in the
  // workdir instead of starting a fresh session.
  continue: z.boolean().optional(),
});
export type StartMessage = z.infer<typeof startMessageSchema>;

export const inboundMessageSchema = z.discriminatedUnion('type', [
  startMessageSchema,
  ...harnessV1BridgeInboundCommandSchemas,
]);
export type InboundMessage = z.infer<typeof inboundMessageSchema>;

export const bridgeReadySchema = harnessV1BridgeReadySchema;
export type BridgeReady = z.infer<typeof bridgeReadySchema>;
