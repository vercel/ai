import { z } from 'zod/v4';

export type { CerebrasChatModelId } from './cerebras-chat-options';

export const cerebrasLanguageModelChatOptions = z.object({
  user: z.string().optional(),
  strictJsonSchema: z.boolean().optional(),
  parallelToolCalls: z.boolean().optional(),
  logprobs: z.boolean().optional(),
  topLogprobs: z.number().int().min(0).max(20).optional(),
  logitBias: z.record(z.string(), z.number().min(-100).max(100)).optional(),
  serviceTier: z.enum(['auto', 'default', 'flex', 'priority']).optional(),
  reasoningEffort: z.enum(['none', 'low', 'medium', 'high']).optional(),
  reasoningFormat: z
    .enum(['none', 'parsed', 'text_parsed', 'raw', 'hidden'])
    .optional(),
  prediction: z
    .object({
      type: z.literal('content'),
      content: z.union([
        z.string(),
        z.array(z.object({ type: z.literal('text'), text: z.string() })),
      ]),
    })
    .optional(),
  promptCacheKey: z.string().max(1024).optional(),
});

export type CerebrasLanguageModelChatOptions = z.infer<
  typeof cerebrasLanguageModelChatOptions
>;
