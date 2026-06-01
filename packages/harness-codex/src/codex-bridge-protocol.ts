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
  // Sent by the bridge the instant it accepts an authenticated WS connection.
  // The Codex host does not block on it (no startup handshake), but it must be
  // a valid frame because the shared bridge runtime emits it on every accept,
  // including reconnects.
  z.object({
    type: z.literal('bridge-hello'),
    state: z.string().optional(),
    lastSeq: z.number().optional(),
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

  z.object({
    type: z.literal('file-change'),
    event: z.enum(['create', 'modify', 'delete']),
    path: z.string(),
    harnessMetadata: harnessMetadataSchema.optional(),
  }),

  z.object({ type: z.literal('error'), error: z.unknown() }),
  z.object({ type: z.literal('raw'), rawValue: z.unknown() }),

  // Bridge's reply to an inbound `detach` request. Carries the
  // adapter-specific payload (Codex: `{ threadId }`) the host wraps into
  // `HarnessV1ResumeState`.
  z.object({
    type: z.literal('detach-state'),
    data: z.unknown(),
  }),
]);

export type OutboundMessage = z.infer<typeof outboundMessageSchema>;

export const inboundMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('start'),
    prompt: z.string(),
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
    reasoningEffort: z.enum(['low', 'medium', 'high']).optional(),
    webSearch: z.boolean().optional(),
    skills: z
      .array(
        z.object({
          name: z.string(),
          description: z.string(),
          content: z.string(),
        }),
      )
      .optional(),
    // Resume signal. When supplied, the bridge calls
    // `codex.resumeThread(resumeThreadId, …)` instead of starting a fresh
    // thread. The host sources the id from the `HarnessV1ResumeState.data`
    // payload it cached from a prior `agent.detach`.
    resumeThreadId: z.string().optional(),
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
  // Reconnect (§9): after re-establishing the socket, the host asks the bridge
  // to replay every buffered event with `seq > lastSeenEventId`.
  z.object({ type: z.literal('resume'), lastSeenEventId: z.number() }),
  // Detach: bridge replies with `detach-state` ({ threadId }) and exits.
  z.object({ type: z.literal('detach') }),
]);

export type InboundMessage = z.infer<typeof inboundMessageSchema>;

export const bridgeReadySchema = z.object({
  type: z.literal('bridge-ready'),
  protocolVersion: z.literal(PROTOCOL_VERSION),
  port: z.number(),
});

export type BridgeReady = z.infer<typeof bridgeReadySchema>;
