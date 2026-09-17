import {
  harnessV1BridgeInboundCommandSchemas,
  harnessV1BridgeOutboundMessageSchema,
  harnessV1BridgeReadySchema,
  harnessV1BridgeStartBaseSchema,
} from '@ai-sdk/harness';
import { z } from 'zod/v4';

/*
 * Claude Code's bridge wire protocol. The outbound events, transport frames,
 * shared inbound commands, and `bridge-ready` line all come from the shared
 * `@ai-sdk/harness` protocol — the only Claude-specific piece is the `start`
 * payload, which carries Claude SDK configuration.
 */

export const outboundMessageSchema = harnessV1BridgeOutboundMessageSchema;
export type OutboundMessage = z.infer<typeof outboundMessageSchema>;

const thinkingDisplaySchema = z.enum(['summarized', 'omitted']).optional();

const thinkingSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('adaptive'),
    display: thinkingDisplaySchema,
  }),
  z.object({
    type: z.literal('enabled'),
    display: thinkingDisplaySchema,
  }),
  z.object({ type: z.literal('disabled') }),
]);

export const startMessageSchema = harnessV1BridgeStartBaseSchema.extend({
  instructions: z.string().optional(),
  thinking: thinkingSchema,
  effort: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).optional(),
  maxTurns: z.number().optional(),
  env: z.record(z.string(), z.string()).optional(),
  skills: z.array(z.string()).optional(),
  mcpServers: z.record(z.string(), z.unknown()).optional(),
  // Resume signal. When true, the bridge passes `{ continue: true }` to the
  // Claude SDK so the in-workdir thread state is rehydrated. The host sets this
  // on the first prompt after a cross-process resume.
  continue: z.boolean().optional(),
  // Exact conversation to resume, as the Claude SDK's `resume` option.
  //
  // Preferred over `continue` whenever the host knows which conversation it
  // means: `continue` resolves to the most recent thread in the workdir, which
  // is the wrong one as soon as anything else has run there since — including
  // a resume that itself started a new thread. Mutually exclusive with
  // `continue` in the SDK, so the bridge sends one or the other.
  resumeSessionId: z.string().optional(),
});

export type StartMessage = z.infer<typeof startMessageSchema>;

export const inboundMessageSchema = z.discriminatedUnion('type', [
  startMessageSchema,
  ...harnessV1BridgeInboundCommandSchemas,
]);
export type InboundMessage = z.infer<typeof inboundMessageSchema>;

export const bridgeReadySchema = harnessV1BridgeReadySchema;
export type BridgeReady = z.infer<typeof bridgeReadySchema>;
