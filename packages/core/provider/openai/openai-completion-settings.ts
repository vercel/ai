// https://platform.openai.com/docs/models
export type OpenAICompletionModelId = 'gpt-3.5-turbo-instruct' | (string & {});

export interface OpenAICompletionSettings {
  /**
   * The ID of the model to use.
   */
  id: OpenAICompletionModelId;

  logitBias?: Record<number, number>;
}
