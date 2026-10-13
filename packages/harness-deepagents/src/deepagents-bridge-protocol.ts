import {
  harnessV1BridgeInboundCommandSchemas,
  harnessV1BridgeOutboundMessageSchema,
  harnessV1BridgeReadySchema,
  harnessV1BridgeStartBaseSchema,
} from '@ai-sdk/harness';
import { z } from 'zod/v4';

// Deep Agents bridge wire protocol; only the `start` payload is adapter-specific.
export const outboundMessageSchema = harnessV1BridgeOutboundMessageSchema;
export type OutboundMessage = z.infer<typeof outboundMessageSchema>;

const thinkingSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('adaptive'),
    display: z.enum(['summarized', 'omitted']).optional(),
  }),
  z.object({
    type: z.literal('enabled'),
    budget_tokens: z.number(),
    display: z.enum(['summarized', 'omitted']).optional(),
  }),
  z.object({ type: z.literal('disabled') }),
]);

export const startMessageSchema = harnessV1BridgeStartBaseSchema.extend({
  mcpServers: z.record(z.string(), z.unknown()).optional(),
  /*
   * Appended to Deep Agents's native system prompt when the bridge constructs
   * the session's agent.
   */
  instructions: z.string().optional(),
  thinking: thinkingSchema.optional(),
  effort: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).optional(),
  // In-backend skills source dirs ($HOME and <workDir>), passed to createDeepAgent({ skills }).
  skillsPaths: z.array(z.string()).optional(),
  skillsChanged: z.boolean().optional(),
  // Max LangGraph super-steps per turn (streamEvents recursionLimit).
  recursionLimit: z.number().optional(),
  headers: z.record(z.string(), z.string()).optional(),
});

export type StartMessage = z.infer<typeof startMessageSchema>;

export const inboundMessageSchema = z.discriminatedUnion('type', [
  startMessageSchema,
  ...harnessV1BridgeInboundCommandSchemas,
]);
export type InboundMessage = z.infer<typeof inboundMessageSchema>;

export const bridgeReadySchema = harnessV1BridgeReadySchema;
export type BridgeReady = z.infer<typeof bridgeReadySchema>;
