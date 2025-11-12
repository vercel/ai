import { z, ZodType } from 'zod/v4';

// https://platform.minimax.io/docs/guides/text-generation
export type MinimaxChatModelId = 'MiniMax-M2' | 'MiniMax-M2-Stable' | (string & {});


export const minimaxChatProviderOptions = z.object({
  /**
   * A unique identifier representing your end-user, which can help the provider to
   * monitor and detect abuse.
   */
  user: z.string().optional(),

  /**
   * Reasoning effort for reasoning models. Defaults to `medium`.
   */
  reasoningEffort: z.string().optional(),

  /**
   * Controls the verbosity of the generated text. Defaults to `medium`.
   */
  textVerbosity: z.string().optional(),
});

export type MinimaxChatProviderOptions = z.infer<
  typeof minimaxChatProviderOptions
>;

export const minimaxErrorDataSchema = z.object({
  error: z.object({
    message: z.string(),
    type: z.string().nullish(),
    param: z.any().nullish(),
    code: z.union([z.string(), z.number()]).nullish(),
  }),
});

export type MinimaxErrorData = z.infer<
  typeof minimaxErrorDataSchema
>;

export type ProviderErrorStructure<T> = {
  errorSchema: ZodType<T>;
  errorToMessage: (error: T) => string;
  isRetryable?: (response: Response, error?: T) => boolean;
};

export const defaultMinimaxErrorStructure: ProviderErrorStructure<MinimaxErrorData> =
{
  errorSchema: minimaxErrorDataSchema,
  errorToMessage: data => data.error.message,
};

