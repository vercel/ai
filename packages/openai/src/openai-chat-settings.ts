// https://platform.openai.com/docs/models
export type OpenAIChatModelId =
  | 'o1'
  | 'o1-2024-12-17'
  | 'o1-mini'
  | 'o1-mini-2024-09-12'
  | 'o1-preview'
  | 'o1-preview-2024-09-12'
  | 'o3-mini'
  | 'o3-mini-2025-01-31'
  | 'gpt-4o'
  | 'gpt-4o-2024-05-13'
  | 'gpt-4o-2024-08-06'
  | 'gpt-4o-2024-11-20'
  | 'gpt-4o-audio-preview'
  | 'gpt-4o-audio-preview-2024-10-01'
  | 'gpt-4o-audio-preview-2024-12-17'
  | 'gpt-4o-mini'
  | 'gpt-4o-mini-2024-07-18'
  | 'gpt-4-turbo'
  | 'gpt-4-turbo-2024-04-09'
  | 'gpt-4-turbo-preview'
  | 'gpt-4-0125-preview'
  | 'gpt-4-1106-preview'
  | 'gpt-4'
  | 'gpt-4-0613'
  | 'gpt-4.5-preview'
  | 'gpt-4.5-preview-2025-02-27'
  | 'gpt-3.5-turbo-0125'
  | 'gpt-3.5-turbo'
  | 'gpt-3.5-turbo-1106'
  | 'chatgpt-4o-latest'
  | (string & {});

export interface OpenAIChatSettings {
  /**
Modify the likelihood of specified tokens appearing in the completion.

Accepts a JSON object that maps tokens (specified by their token ID in
the GPT tokenizer) to an associated bias value from -100 to 100. You
can use this tokenizer tool to convert text to token IDs. Mathematically,
the bias is added to the logits generated by the model prior to sampling.
The exact effect will vary per model, but values between -1 and 1 should
decrease or increase likelihood of selection; values like -100 or 100
should result in a ban or exclusive selection of the relevant token.

As an example, you can pass {"50256": -100} to prevent the <|endoftext|>
token from being generated.
*/
  logitBias?: Record<number, number>;

  /**
Return the log probabilities of the tokens. Including logprobs will increase
the response size and can slow down response times. However, it can
be useful to better understand how the model is behaving.

Setting to true will return the log probabilities of the tokens that
were generated.

Setting to a number will return the log probabilities of the top n
tokens that were generated.
*/
  logprobs?: boolean | number;

  /**
Whether to enable parallel function calling during tool use. Default to true.
   */
  parallelToolCalls?: boolean;

  /**
Whether to use structured outputs. Defaults to false.

When enabled, tool calls and object generation will be strict and follow the provided schema.
 */
  structuredOutputs?: boolean;

  /**
A unique identifier representing your end-user, which can help OpenAI to
monitor and detect abuse. Learn more.
*/
  user?: string;

  /**
Automatically download images and pass the image as data to the model.
OpenAI supports image URLs for public models, so this is only needed for
private models or when the images are not publicly accessible.

Defaults to `false`.
   */
  downloadImages?: boolean;

  /**
Reasoning effort for reasoning models. Defaults to `medium`.
   */
  reasoningEffort?: 'low' | 'medium' | 'high';
}
