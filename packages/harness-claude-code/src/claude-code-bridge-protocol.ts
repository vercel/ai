import { z } from 'zod/v4';

export const PROTOCOL_VERSION = 1;

const usageSchema = z.object({
  inputTokens: z.looseObject({
    total: z.number().optional(),
    noCache: z.number().optional(),
    cacheRead: z.number().optional(),
    cacheWrite: z.number().optional(),
  }),
  outputTokens: z.looseObject({
    total: z.number().optional(),
    text: z.number().optional(),
    reasoning: z.number().optional(),
  }),
});

const finishReasonSchema = z.object({
  unified: z.string(),
  raw: z.unknown().optional(),
});

const harnessMetadataSchema = z.record(
  z.string(),
  z.record(z.string(), z.unknown()),
);

export const outboundMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('stream-start'),
    warnings: z.array(z.unknown()).optional(),
  }),

  z.object({
    type: z.literal('text-start'),
    id: z.string(),
    harnessMetadata: harnessMetadataSchema.optional(),
  }),
  z.object({
    type: z.literal('text-delta'),
    id: z.string(),
    delta: z.string(),
    harnessMetadata: harnessMetadataSchema.optional(),
  }),
  z.object({
    type: z.literal('text-end'),
    id: z.string(),
    harnessMetadata: harnessMetadataSchema.optional(),
  }),

  z.object({
    type: z.literal('reasoning-start'),
    id: z.string(),
    harnessMetadata: harnessMetadataSchema.optional(),
  }),
  z.object({
    type: z.literal('reasoning-delta'),
    id: z.string(),
    delta: z.string(),
    harnessMetadata: harnessMetadataSchema.optional(),
  }),
  z.object({
    type: z.literal('reasoning-end'),
    id: z.string(),
    harnessMetadata: harnessMetadataSchema.optional(),
  }),

  z.object({
    type: z.literal('tool-call'),
    toolCallId: z.string(),
    toolName: z.string(),
    input: z.string(),
    nativeName: z.string().optional(),
    observeOnly: z.boolean().optional(),
    harnessMetadata: harnessMetadataSchema.optional(),
  }),

  z.object({
    type: z.literal('tool-result'),
    toolCallId: z.string(),
    toolName: z.string(),
    result: z.unknown(),
    isError: z.boolean().optional(),
    harnessMetadata: harnessMetadataSchema.optional(),
  }),

  z.object({
    type: z.literal('finish-step'),
    finishReason: finishReasonSchema,
    usage: usageSchema,
    harnessMetadata: harnessMetadataSchema.optional(),
  }),

  z.object({
    type: z.literal('finish'),
    finishReason: finishReasonSchema,
    totalUsage: usageSchema,
    harnessMetadata: harnessMetadataSchema.optional(),
  }),

  z.object({ type: z.literal('error'), error: z.unknown() }),
  z.object({ type: z.literal('raw'), rawValue: z.unknown() }),
]);

export type OutboundMessage = z.infer<typeof outboundMessageSchema>;

export const inboundMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('start'),
    promptMessages: z.array(z.unknown()),
    instructions: z.string().optional(),
    tools: z
      .array(
        z.object({
          name: z.string(),
          description: z.string().optional(),
          inputSchema: z.unknown().optional(),
        }),
      )
      .optional(),
    activeBuiltinTools: z.array(z.string()).optional(),
    harnessOptions: z.record(z.string(), z.unknown()).optional(),
  }),
  z.object({
    type: z.literal('tool-result'),
    toolCallId: z.string(),
    output: z.unknown(),
    isError: z.boolean().optional(),
  }),
  z.object({ type: z.literal('user-message'), text: z.string() }),
  z.object({ type: z.literal('abort') }),
  z.object({ type: z.literal('shutdown') }),
]);

export type InboundMessage = z.infer<typeof inboundMessageSchema>;

export const bridgeReadySchema = z.object({
  type: z.literal('bridge-ready'),
  protocolVersion: z.literal(PROTOCOL_VERSION),
  port: z.number(),
});

export type BridgeReady = z.infer<typeof bridgeReadySchema>;
