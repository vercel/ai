import MistralClient, {
  ChatCompletionResponseChunk,
  ResponseFormat,
  ToolChoice,
} from '@mistralai/mistralai';
import {
  LanguageModel,
  LanguageModelSettings,
  LanguageModelStreamPart,
  ObjectMode,
} from '../../core';
import { readableFromAsyncIterable } from '../../streams/ai-stream';
import { convertToMistralChatPrompt } from './convert-to-mistral-chat-prompt';

export type MistralChatModelType =
  | 'open-mistral-7b'
  | 'open-mixtral-8x7b'
  | 'mistral-small-latest'
  | 'mistral-medium-latest'
  | 'mistral-large-latest'
  | (string & {});

export interface MistralChatLanguageModelSettings
  extends LanguageModelSettings {
  client: () => Promise<MistralClient>;

  /**
   * The ID of the model to use.
   */
  id: MistralChatModelType;

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

export class MistralChatLanguageModel implements LanguageModel {
  readonly settings: MistralChatLanguageModelSettings;

  constructor(settings: MistralChatLanguageModelSettings) {
    this.settings = settings;
  }

  private getClient(): Promise<MistralClient> {
    return this.settings.client();
  }

  get objectMode(): ObjectMode {
    return this.settings.objectMode ?? 'json';
  }

  private get basePrompt() {
    return {
      model: this.settings.id,

      maxTokens: this.settings.maxTokens,

      temperature: this.settings.temperature,
      topP: this.settings.topP,
      randomSeed: this.settings.randomSeed,
      safePrompt: this.settings.safePrompt,
    };
  }

  private getDoGenerateArgs({
    mode,
    prompt,
  }: Parameters<LanguageModel['doGenerate']>[0]): Parameters<
    MistralClient['chat']
  >[0] {
    const type = mode.type;
    const messages = convertToMistralChatPrompt(prompt);

    switch (type) {
      case 'regular': {
        return {
          ...this.basePrompt,
          messages,
          // TODO tools
        };
      }

      case 'object-json': {
        return {
          ...this.basePrompt,
          responseFormat: { type: 'json_object' } as ResponseFormat,
          messages,
        };
      }

      case 'object-tool': {
        return {
          ...this.basePrompt,
          toolChoice: 'any' as ToolChoice,
          tools: [
            {
              type: 'function',
              function: {
                name: mode.tool.name,
                description: mode.tool.description ?? '',
                parameters: mode.tool.parameters,
              },
            },
          ],
          messages,
        };
      }

      default: {
        const _exhaustiveCheck: never = type;
        throw new Error(`Unsupported type: ${_exhaustiveCheck}`);
      }
    }
  }

  async doGenerate({
    mode,
    prompt,
  }: Parameters<LanguageModel['doGenerate']>[0]) {
    const client = await this.getClient();

    const clientResponse = await client.chat(
      this.getDoGenerateArgs({ mode, prompt }),
    );

    // Note: correct types not supported by MistralClient as of 2024-Feb-28
    const message = clientResponse.choices[0].message as any;

    return {
      text: message.content,
      toolCalls: message.tool_calls?.map((toolCall: any) => ({
        toolCallId: toolCall.id,
        toolName: toolCall.function.name,
        args: toolCall.function.arguments,
      })),
    };
  }

  async doStream({
    mode,
    prompt,
  }: Parameters<LanguageModel['doStream']>[0]): Promise<
    ReadableStream<LanguageModelStreamPart>
  > {
    const type = mode.type;
    const messages = convertToMistralChatPrompt(prompt);
    const client = await this.getClient();

    switch (type) {
      case 'regular': {
        const response = client.chatStream({
          ...this.basePrompt,
          messages: convertToMistralChatPrompt(prompt),
        });

        return readableFromAsyncIterable(response).pipeThrough(
          new TransformStream<
            ChatCompletionResponseChunk,
            LanguageModelStreamPart
          >({
            transform(chunk, controller) {
              if (chunk.choices?.[0].delta == null) {
                return;
              }

              const delta = chunk.choices[0].delta;

              if (delta.content != null) {
                controller.enqueue({
                  type: 'text-delta',
                  textDelta: delta.content,
                });
              }
            },
          }),
        );
      }

      case 'object-json': {
        const response = client.chatStream({
          ...this.basePrompt,
          responseFormat: { type: 'json_object' } as ResponseFormat,
          messages,
        });

        return readableFromAsyncIterable(response).pipeThrough(
          new TransformStream<
            ChatCompletionResponseChunk,
            LanguageModelStreamPart
          >({
            transform(chunk, controller) {
              if (chunk.choices?.[0].delta == null) {
                return;
              }

              const delta = chunk.choices[0].delta;

              if (delta.content != null) {
                controller.enqueue({
                  type: 'text-delta',
                  textDelta: delta.content,
                });
              }
            },
          }),
        );
      }

      case 'object-tool': {
        const response = client.chatStream({
          ...this.basePrompt,
          toolChoice: 'any' as ToolChoice,
          tools: [
            {
              type: 'function',
              function: {
                name: mode.tool.name,
                description: mode.tool.description ?? '',
                parameters: mode.tool.parameters,
              },
            },
          ],
          messages,
        });

        return readableFromAsyncIterable(response).pipeThrough(
          new TransformStream<
            ChatCompletionResponseChunk,
            LanguageModelStreamPart
          >({
            transform(chunk, controller) {
              if (chunk.choices?.[0].delta == null) {
                return;
              }

              const delta = chunk.choices[0].delta;

              if (delta.content != null) {
                controller.enqueue({
                  type: 'tool-call-delta',
                  // Note: Mistral does not support tool streaming as of 2024-Feb-28
                  // The result come in a single chunk as content.
                  toolCallId: delta.tool_calls?.[0]?.id ?? '', // TODO empty?
                  toolName: delta.tool_calls?.[0]?.function.name ?? '', // TODO empty?
                  argsTextDelta: delta.content,
                });
              }
            },
          }),
        );
      }

      default: {
        const _exhaustiveCheck: never = type;
        throw new Error(`Unsupported type: ${_exhaustiveCheck}`);
      }
    }
  }
}
