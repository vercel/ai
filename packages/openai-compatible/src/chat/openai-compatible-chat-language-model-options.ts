import { z } from 'zod/v4';

export type OpenAICompatibleChatModelId = string;

export const openaiCompatibleLanguageModelChatOptions = z.object({
  /**
   * A unique identifier representing your end-user, which can help the provider to
   * monitor and detect abuse.
   */
  user: z.string().optional(),

  /**
   * Reasoning effort for reasoning models. Defaults to `medium`.
   *
   * Set to `null` to send `"reasoning_effort": null`, for providers that treat
   * an explicit `null` differently from an omitted field.
   */
  reasoningEffort: z.string().nullish(),

  /**
   * Controls the verbosity of the generated text. Defaults to `medium`.
   */
  textVerbosity: z.string().optional(),

  /**
   * Whether to use strict JSON schema validation.
   * When true, the model uses constrained decoding to guarantee schema compliance.
   * Only used when the provider supports structured outputs and a schema is provided.
   *
   * @default true
   */
  strictJsonSchema: z.boolean().optional(),
});

export type OpenAICompatibleLanguageModelChatOptions = z.infer<
  typeof openaiCompatibleLanguageModelChatOptions
>;
