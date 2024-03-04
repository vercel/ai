import { LanguageModelSettings, ObjectMode } from '../../core';

// https://platform.openai.com/docs/models
export type OpenAIChatModelId =
  | 'gpt-4'
  | 'gpt-4-0314'
  | 'gpt-4-0613'
  | 'gpt-4-turbo-preview'
  | 'gpt-4-1106-preview'
  | 'gpt-4-0125-preview'
  | 'gpt-4-vision-preview'
  | 'gpt-4-32k'
  | 'gpt-4-32k-0314'
  | 'gpt-4-32k-0613'
  | 'gpt-3.5-turbo'
  | 'gpt-3.5-turbo-0125'
  | 'gpt-3.5-turbo-1106'
  | 'gpt-3.5-turbo-0301'
  | 'gpt-3.5-turbo-0613'
  | 'gpt-3.5-turbo-16k'
  | 'gpt-3.5-turbo-16k-0613'
  | (string & {});

export interface OpenAIChatSettings extends LanguageModelSettings {
  objectMode?: ObjectMode;

  /**
   * The ID of the model to use.
   */
  id: OpenAIChatModelId;

  /**
   * `temperature`: Controls the randomness and creativity in the model's responses.
   * A lower temperature (close to 0) results in more predictable, conservative text, while a higher temperature (close to 1) produces more varied and creative output.
   * Adjust this to balance between consistency and creativity in the model's replies.
   * Example: temperature: 0.5
   */
  temperature?: number;

  /**
   *  This parameter sets a threshold for token selection based on probability.
   * The model will only consider the most likely tokens that cumulatively exceed this threshold while generating a response.
   * It's a way to control the randomness of the output, balancing between diverse responses and sticking to more likely words.
   * This means a topP of .1 will be far less random than one at .9
   * Example: topP: 0.2
   */
  topP?: number;

  /**
   * Used to set the initial state for the random number generator in the model.
   * Providing a specific seed value ensures consistent outputs for the same inputs across different runs - useful for testing and reproducibility.
   * A `null` value (or not setting it) results in varied, non-repeatable outputs each time.
   * Example: seed: 89 (or) seed: null
   */
  seed?: number | null;

  /**
   * Discourages the model from repeating the same information or context already mentioned in the conversation or prompt.
   * Increasing this value encourages the model to introduce new topics or ideas, rather than reiterating what has been said.
   * This is useful for maintaining a diverse and engaging conversation or for brainstorming sessions where varied ideas are needed.
   * Example: presencePenalty: 1.0 // Strongly discourages repeating the same content.
   */
  presencePenalty?: number;

  /**
   * This parameter reduces the likelihood of the model repeatedly using the same words or phrases in its responses.
   * A higher frequency penalty promotes a wider variety of language and expressions in the output.
   * This is particularly useful in creative writing or content generation tasks where diversity in language is desirable.
   * Example: frequencyPenalty: 0.5 // Moderately discourages repetitive language.
   */
  frequencyPenalty?: number;

  logitBias?: Record<number, number>;
}
