import MistralClient from '@mistralai/mistralai';
import {
  ErrorStreamPart,
  LanguageModel,
  LanguageModelStreamPart,
  UnsupportedFunctionalityError,
} from '../../function';
import { ChatPrompt } from '../../function/language-model/prompt/chat-prompt';
import { InstructionPrompt } from '../../function/language-model/prompt/instruction-prompt';
import { convertToMistralChatPrompt } from './mistral-chat-prompt';

export interface MistralChatLanguageModelSettings {
  id: string;
  maxTokens?: number;
  client?: MistralClient;
}

export class MistralChatLanguageModel implements LanguageModel {
  readonly settings: MistralChatLanguageModelSettings;

  constructor(settings: MistralChatLanguageModelSettings) {
    this.settings = settings;
  }

  get client() {
    return (
      this.settings.client || new MistralClient(process.env.Mistral_API_KEY)
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
