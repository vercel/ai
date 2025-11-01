import { z } from 'zod/v4';

export type XaiResponsesModelId =
  | 'grok-4'
  | 'grok-4-fast'
  | 'grok-4-fast-non-reasoning'
  | (string & {});

export const xaiResponsesProviderOptions = z.object({
  reasoningEffort: z.enum(['low', 'high']).optional(),
});

export type XaiResponsesProviderOptions = z.infer<
  typeof xaiResponsesProviderOptions
>;
