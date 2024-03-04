import MistralClient from '@mistralai/mistralai';
import { LanguageModelSettings, ObjectMode } from '../../core';

export type MistralChatModelId =
  | 'open-mistral-7b'
  | 'open-mixtral-8x7b'
  | 'mistral-small-latest'
  | 'mistral-medium-latest'
  | 'mistral-large-latest'
  | (string & {});

export interface MistralChatSettings extends LanguageModelSettings {
  client: () => Promise<MistralClient>;

  /**
   * The ID of the model to use.
   */
  id: MistralChatModelId;

  objectMode?: ObjectMode;

  /**
   * What sampling temperature to use, between 0.0 and 1.0.
   * Higher values like 0.8 will make the output more random, while lower values like 0.2 will make it more focused and deterministic.
   *
   * Default: 0.7
   */
  temperature?: number;

  /**
   * Nucleus sampling, where the model considers the results of the tokens with top_p probability mass.
   * So 0.1 means only the tokens comprising the top 10% probability mass are considered.
   *
   * We generally recommend altering this or temperature but not both.
   *
   * Default: 1
   */
  topP?: number;

  /**
   * The seed to use for random sampling. If set, different calls will generate deterministic results.
   *
   * Default: undefined
   */
  randomSeed?: number;

  /**
   * Whether to inject a safety prompt before all conversations.
   *
   * Default: false
   */
  safePrompt?: boolean;
}
