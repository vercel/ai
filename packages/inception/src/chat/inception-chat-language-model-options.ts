import { z } from 'zod/v4';
import type { inceptionModelCatalog } from '../inception-model-catalog';

export type InceptionChatModelId =
  | keyof typeof inceptionModelCatalog
  | (string & {});

export const inceptionLanguageModelChatOptions = z.object({
  /** Controls how much the model deliberates before answering. */
  reasoningEffort: z.enum(['instant', 'low', 'medium', 'high']).optional(),
  /** Use strict JSON schema validation for structured outputs. Defaults to true. */
  strictJsonSchema: z.boolean().optional(),
  /** Optimize for realtime workloads with lower time to first token. */
  realtime: z.boolean().optional(),
});

export type InceptionLanguageModelChatOptions = z.infer<
  typeof inceptionLanguageModelChatOptions
>;
