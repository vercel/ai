import MistralClient from '@mistralai/mistralai';
import {
  ErrorStreamPart,
  LanguageModel,
  LanguageModelSettings,
  LanguageModelStreamPart,
  UnsupportedFunctionalityError,
} from '../../function';
import { ChatPrompt } from '../../function/language-model/prompt/chat-prompt';
import { InstructionPrompt } from '../../function/language-model/prompt/instruction-prompt';
import { convertToMistralChatPrompt } from './mistral-chat-prompt';

export type MistralChatModelType =
  | 'open-mistral-7b'
  | 'open-mixtral-8x7b'
  | 'mistral-small-latest'
  | 'mistral-medium-latest'
  | 'mistral-large-latest'
  | (string & {});

export interface MistralChatLanguageModelSettings
  extends LanguageModelSettings {
  client?: MistralClient;

  id: MistralChatModelType;

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
   * Default: null
   */
  randomSeed?: number | null;

  /**
   * Whether to inject a safety prompt before all conversations.
   *
   * Default: false
   */
  safePrompt?: boolean;
}

export class MistralChatLanguageModel implements LanguageModel {
  readonly settings: MistralChatLanguageModelSettings;

  constructor(settings: MistralChatLanguageModelSettings) {
    this.settings = settings;
  }

  get client() {
    return (
      this.settings.client ?? new MistralClient(process.env.Mistral_API_KEY)
    );
  }

  async doGenerate({ prompt }: { prompt: ChatPrompt | InstructionPrompt }) {
    const openaiResponse = await this.client.chat({
      model: this.settings.id,
      maxTokens: this.settings.maxTokens,
      messages: convertToMistralChatPrompt(prompt),
    });

    return {
      text: openaiResponse.choices[0].message.content!,
    };
  }

  doGenerateJsonText = async ({
    schema,
    prompt,
  }: {
    schema: Record<string, unknown>;
    prompt: ChatPrompt | InstructionPrompt;
  }): Promise<{
    jsonText: string;
  }> => {
    throw new UnsupportedFunctionalityError({
      provider: 'mistral.chat',
      functionality: 'doGenerateJsonText',
    });
  };

  async doStream({
    prompt,
    tools,
  }: {
    prompt: InstructionPrompt | ChatPrompt;
    tools?: Array<{
      name: string;
      description?: string;
      parameters: Record<string, unknown>;
    }>;
  }): Promise<ReadableStream<LanguageModelStreamPart>> {
    throw new UnsupportedFunctionalityError({
      provider: 'mistral.chat',
      functionality: 'doStream',
    });
  }

  async doStreamJsonText({
    schema,
    prompt,
  }: {
    schema: Record<string, unknown>;
    prompt: InstructionPrompt | ChatPrompt;
  }): Promise<
    ReadableStream<
      { type: 'json-text-delta'; textDelta: string } | ErrorStreamPart
    >
  > {
    throw new UnsupportedFunctionalityError({
      provider: 'mistral.chat',
      functionality: 'doStreamJsonText',
    });
  }
}
