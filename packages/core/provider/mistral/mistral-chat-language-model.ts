import MistralClient, {
  ChatCompletionResponseChunk,
  ResponseFormat,
  ToolChoice,
} from '@mistralai/mistralai';
import { LanguageModel, LanguageModelStreamPart } from '../../core';
import { readableFromAsyncIterable } from '../../streams/ai-stream';
import { convertToMistralChatPrompt } from './convert-to-mistral-chat-prompt';
import { MistralChatSettings } from './mistral-chat-settings';
import { LanguageModelV1CallWarning } from '../../core/language-model/v1/language-model-v1-call-warning';

export class MistralChatLanguageModel implements LanguageModel {
  readonly settings: MistralChatSettings;

  readonly defaultObjectGenerationMode = 'json';

  private readonly getClient: () => Promise<MistralClient>;

  constructor(
    settings: MistralChatSettings,
    config: {
      client: () => Promise<MistralClient>;
    },
  ) {
    this.settings = settings;
    this.getClient = config.client;
  }

  private get basePrompt() {
    return {
      model: this.settings.id,
      safePrompt: this.settings.safePrompt,
    };
  }

  private getArgs({
    mode,
    prompt,
    maxTokens,
    temperature,
    topP,
    frequencyPenalty,
    presencePenalty,
    seed,
  }: Parameters<LanguageModel['doGenerate']>[0]): {
    args: Parameters<MistralClient['chat']>[0];
    warnings: LanguageModelV1CallWarning[];
  } {
    const type = mode.type;
    const messages = convertToMistralChatPrompt(prompt);

    const warnings: LanguageModelV1CallWarning[] = [];

    if (frequencyPenalty != null) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'frequencyPenalty',
      });
    }

    if (presencePenalty != null) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'presencePenalty',
      });
    }

    // TODO standardize temperature scale
    const standardizedSettings = {
      maxTokens,
      temperature,
      topP,
      randomSeed: seed,
    };

    switch (type) {
      case 'regular': {
        return {
          args: {
            ...this.basePrompt,
            ...standardizedSettings,
            messages,
            // TODO tools
          },
          warnings,
        };
      }

      case 'object-json': {
        return {
          args: {
            ...this.basePrompt,
            ...standardizedSettings,
            responseFormat: { type: 'json_object' } as ResponseFormat,
            messages,
          },
          warnings,
        };
      }

      case 'object-tool': {
        return {
          args: {
            ...this.basePrompt,
            ...standardizedSettings,
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
          },
          warnings,
        };
      }

      case 'object-grammar': {
        throw new Error('Grammar mode not supported by Mistral');
      }

      default: {
        const _exhaustiveCheck: never = type;
        throw new Error(`Unsupported type: ${_exhaustiveCheck}`);
      }
    }
  }

  async doGenerate(
    options: Parameters<LanguageModel['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<LanguageModel['doGenerate']>>> {
    const client = await this.getClient();
    const { args, warnings } = this.getArgs(options);
    const clientResponse = await client.chat(args);

    // Note: correct types not supported by MistralClient as of 2024-Feb-28
    const message = clientResponse.choices[0].message as any;

    return {
      text: message.content,
      toolCalls: message.tool_calls?.map((toolCall: any) => ({
        toolCallId: toolCall.id,
        toolName: toolCall.function.name,
        args: toolCall.function.arguments,
      })),
      warnings,
    };
  }

  async doStream(
    options: Parameters<LanguageModel['doStream']>[0],
  ): Promise<Awaited<ReturnType<LanguageModel['doStream']>>> {
    const client = await this.getClient();
    const { args, warnings } = this.getArgs(options);
    const response = client.chatStream(args);

    return {
      warnings,
      stream: readableFromAsyncIterable(response).pipeThrough(
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

            // Note: Mistral does not support tool streaming as of 2024-Feb-29
            // The result come in a single chunk as content.
            if (options.mode.type === 'object-tool' && delta.content != null) {
              controller.enqueue({
                type: 'tool-call-delta',
                toolCallId: delta.tool_calls?.[0]?.id ?? '', // TODO empty?
                toolName: delta.tool_calls?.[0]?.function.name ?? '', // TODO empty?
                argsTextDelta: delta.content,
              });
            }
          },
        }),
      ),
    };
  }
}
