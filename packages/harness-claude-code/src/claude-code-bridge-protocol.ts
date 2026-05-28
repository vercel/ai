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
  // Sent unconditionally by the bridge the instant it accepts an
  // authenticated WS connection. The host waits for it before sending
  // its first `start` message, because some sandbox runtimes (notably
  // Vercel) complete the upstream WS handshake with the host long
  // before the underlying connection is actually wired through to the
  // sandbox-side bridge process — anything the host sends in that gap
  // is silently dropped.
  z.object({
    type: z.literal('bridge-hello'),
  }),

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
    providerExecuted: z.boolean().optional(),
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

  // Bridge's reply to an inbound `detach` request. Carries the
  // adapter-specific payload the host serializes into `HarnessV1ResumeState`.
  z.object({
    type: z.literal('detach-state'),
    data: z.unknown(),
  }),
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
    model: z.string().optional(),
    maxTurns: z.number().optional(),
    thinking: z.enum(['off', 'on', 'adaptive']).optional(),
    // Resume signal. When true, the bridge passes `{ continue: true }` to
    // the Claude SDK so the in-workdir thread state is rehydrated. The
    // host sets this on the first prompt after a cross-process resume.
    continue: z.boolean().optional(),
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
  // Detach the current session: the bridge replies with `detach-state`
  // carrying any adapter-specific payload it has cached, then exits. The
  // host wraps the reply into `HarnessV1ResumeState`.
  z.object({ type: z.literal('detach') }),
]);

export type InboundMessage = z.infer<typeof inboundMessageSchema>;

export const bridgeReadySchema = z.object({
  type: z.literal('bridge-ready'),
  protocolVersion: z.literal(PROTOCOL_VERSION),
  port: z.number(),
});

export type BridgeReady = z.infer<typeof bridgeReadySchema>;
