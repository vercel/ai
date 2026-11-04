import { z } from 'zod/v4';

export type BasetenDecisionModelId =
  | 'decision-models/baseten-elephant-9b-latest'
  | 'decision-models/baseten-mammoth-27b-latest'
  | (string & {});

export const basetenDecisionModelOptions = z.object({
  /** Maximum tokens in each question's complete input prompt. */
  maxLen: z.number().int().positive().optional(),
});

export type BasetenDecisionModelOptions = z.infer<
  typeof basetenDecisionModelOptions
>;
