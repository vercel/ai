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

/*
 * Content block schemas for structured prompts that carry inline images
 * alongside text. These mirror the Claude Agent SDK's streaming-input content
 * shapes so the bridge can forward them without re-serialisation.
 */
const imageSourceSchema = z.object({
  type: z.literal('base64'),
  media_type: z.string(),
  data: z.string(),
});

export const promptContentBlockSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string() }),
  z.object({ type: z.literal('image'), source: imageSourceSchema }),
]);

export type PromptContentBlock = z.infer<typeof promptContentBlockSchema>;

export const startMessageSchema = harnessV1BridgeStartBaseSchema.extend({
  // Override the base schema's `prompt: z.string()` to also accept a
  // structured content array when the prompt contains inline images.
  prompt: z.union([z.string(), z.array(promptContentBlockSchema)]),
  thinking: thinkingSchema,
  maxTurns: z.number().optional(),
  skills: z.array(z.string()).optional(),
  // Resume signal. When true, the bridge passes `{ continue: true }` to the
  // Claude SDK so the in-workdir thread state is rehydrated. The host sets this
  // on the first prompt after a cross-process resume.
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
