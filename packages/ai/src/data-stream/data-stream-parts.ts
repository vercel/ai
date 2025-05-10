import { z } from 'zod';

const languageModelUsageSchema = z.object({
  inputTokens: z.number().optional(),
  outputTokens: z.number().optional(),
  totalTokens: z.number().optional(),
  reasoningTokens: z.number().optional(),
  cachedInputTokens: z.number().optional(),
});

const finishReasonSchema = z.enum([
  'stop',
  'length',
  'tool-calls',
  'content-filter',
  'other',
  'error',
  'unknown',
]);

const toolCallSchema = z.object({
  toolCallId: z.string(),
  toolName: z.string(),
  args: z.unknown(),
});

const toolResultValueSchema = z.object({
  toolCallId: z.string(),
  result: z.unknown(),
  providerMetadata: z.any().optional(),
});

const sourceSchema = z.object({
  type: z.literal('source'),
  sourceType: z.literal('url'),
  id: z.string(),
  url: z.string(),
  title: z.string().optional(),
  providerMetadata: z.any().optional(), // Use z.any() for generic metadata
});

export const dataStreamPartSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('text'),
    value: z.string(),
  }),
  z.object({
    type: z.literal('data'),
    value: z.array(z.any()), // TODO json validation
  }),
  z.object({
    type: z.literal('error'),
    value: z.string(),
  }),
  z.object({
    type: z.literal('message-annotations'),
    value: z.array(z.any()), // TODO json validation
  }),
  z.object({
    type: z.literal('tool-call'),
    value: toolCallSchema,
  }),
  z.object({
    type: z.literal('tool-result'),
    value: toolResultValueSchema,
  }),
  z.object({
    type: z.literal('tool-call-streaming-start'),
    value: z.object({ toolCallId: z.string(), toolName: z.string() }),
  }),
  z.object({
    type: z.literal('tool-call-delta'),
    value: z.object({ toolCallId: z.string(), argsTextDelta: z.string() }),
  }),
  z.object({
    type: z.literal('reasoning'),
    value: z.object({
      text: z.string(),
      providerMetadata: z.record(z.any()).optional(),
    }),
  }),
  z.object({
    type: z.literal('source'),
    value: sourceSchema,
  }),
  z.object({
    type: z.literal('file'),
    value: z.object({
      url: z.string(),
      mediaType: z.string(),
    }),
  }),
  z.object({
    type: z.literal('start-step'),
    value: z.object({}),
  }),
  z.object({
    type: z.literal('finish-step'),
    value: z.object({
      finishReason: finishReasonSchema,
      usage: languageModelUsageSchema.optional(),
    }),
  }),
  z.object({
    type: z.literal('start'),
    value: z.object({
      messageId: z.string(),
    }),
  }),
  z.object({
    type: z.literal('finish'),
    value: z.object({
      messageId: z.string(),
      finishReason: finishReasonSchema,
      totalUsage: languageModelUsageSchema.optional(),
    }),
  }),
  z.object({
    type: z.literal('reasoning-part-finish'),
    value: z.null(),
  }),
]);

export type DataStreamPart = z.infer<typeof dataStreamPartSchema>;
