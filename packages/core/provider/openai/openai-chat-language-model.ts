import { nanoid } from 'nanoid';
import OpenAI from 'openai';
import {
  LanguageModel,
  LanguageModelSettings,
  LanguageModelStreamPart,
  ObjectMode,
} from '../../core';
import { ChatPrompt } from '../../core/language-model/prompt/chat-prompt';
import { InstructionPrompt } from '../../core/language-model/prompt/instruction-prompt';
import { tryParseJSON } from '../../core/util/try-json-parse';
import { readableFromAsyncIterable } from '../../streams';
import {
  convertChatPromptToOpenAIChatPrompt,
  convertToOpenAIChatPrompt,
} from './openai-chat-prompt';

export interface OpenAIChatLanguageModelSettings extends LanguageModelSettings {
  client: () => Promise<OpenAI>;

  /**
   * The ID of the model to use.
   */
  id: string;

  objectMode?: ObjectMode;
}

export class OpenAIChatLanguageModel implements LanguageModel {
  readonly settings: OpenAIChatLanguageModelSettings;

  constructor(settings: OpenAIChatLanguageModelSettings) {
    this.settings = settings;
  }

  private getClient(): Promise<OpenAI> {
    return this.settings.client();
  }

  get objectMode(): ObjectMode {
    return this.settings.objectMode ?? 'tool';
  }

  private get basePrompt() {
    return {
      model: this.settings.id,

      max_tokens: this.settings.maxTokens,
    };
  }

  async doGenerate({ prompt }: { prompt: ChatPrompt | InstructionPrompt }) {
    const client = await this.getClient();
    const openaiResponse = await client.chat.completions.create({
      ...this.basePrompt,
      messages: convertToOpenAIChatPrompt(prompt),
    });

    return {
      text: openaiResponse.choices[0].message.content!,
    };
  }

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
    const client = await this.getClient();
    const openaiResponse = await client.chat.completions.create({
      ...this.basePrompt,
      stream: true,
      messages: convertToOpenAIChatPrompt(prompt),
      tools: tools?.map(tool => ({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        },
      })),
    });

    const toolCalls: Array<{
      id?: string;
      type?: 'function';
      function?: {
        name?: string;
        arguments?: string;
      };
    }> = [];

    return readableFromAsyncIterable(openaiResponse).pipeThrough(
      new TransformStream<
        OpenAI.Chat.Completions.ChatCompletionChunk,
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

          if (delta.tool_calls != null) {
            for (const toolCallDelta of delta.tool_calls) {
              const index = toolCallDelta.index;

              // new tool call, add to list
              if (toolCalls[index] == null) {
                toolCalls[index] = toolCallDelta;
                continue;
              }

              // existing tool call, merge
              const toolCall = toolCalls[index];

              if (toolCallDelta.function?.arguments != null) {
                toolCall.function!.arguments +=
                  toolCallDelta.function?.arguments ?? '';
              }

              // check if tool call is complete
              if (
                toolCall.function?.name == null ||
                toolCall.function?.arguments == null
              ) {
                continue;
              }

              const args = tryParseJSON(toolCall.function.arguments);

              if (args == null) {
                continue;
              }

              controller.enqueue({
                type: 'tool-call',
                toolCallId: toolCall.id ?? nanoid(),
                toolName: toolCall.function.name,
                args,
              });
            }
          }
        },
      }),
    );
  }

  async doGenerateJsonText({
    mode,
    prompt,
  }: Parameters<LanguageModel['doGenerateJsonText']>[0]) {
    const type = mode.type;
    const messages = convertChatPromptToOpenAIChatPrompt(prompt);
    const client = await this.getClient();

    switch (type) {
      case 'json': {
        const openaiResponse = await client.chat.completions.create({
          ...this.basePrompt,
          response_format: { type: 'json_object' },
          messages,
        });

        // TODO extract standard response processing
        return {
          text: openaiResponse.choices[0].message.content ?? undefined,
        };
      }

      case 'tool': {
        const openaiResponse = await client.chat.completions.create({
          ...this.basePrompt,
          tool_choice: { type: 'function', function: { name: mode.tool.name } },
          tools: [{ type: 'function', function: mode.tool }],
          messages,
        });

        // TODO extract standard response processing
        return {
          toolCalls: openaiResponse.choices[0].message.tool_calls?.map(
            toolCall => ({
              toolCallId: toolCall.id,
              toolName: toolCall.function.name,
              args: toolCall.function.arguments!,
            }),
          ),
        };
      }

      default: {
        const _exhaustiveCheck: never = type;
        throw new Error(`Unsupported type: ${_exhaustiveCheck}`);
      }
    }
  }

  async doStreamJsonText({
    mode,
    prompt,
  }: Parameters<LanguageModel['doStreamJsonText']>[0]): Promise<
    ReadableStream<LanguageModelStreamPart>
  > {
    const type = mode.type;
    const messages = convertChatPromptToOpenAIChatPrompt(prompt);
    const client = await this.getClient();

    switch (type) {
      case 'json': {
        const clientResponse = await client.chat.completions.create({
          ...this.basePrompt,
          stream: true,
          response_format: { type: 'json_object' },
          messages,
        });

        return readableFromAsyncIterable(clientResponse).pipeThrough(
          new TransformStream<
            OpenAI.Chat.Completions.ChatCompletionChunk,
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

      case 'tool': {
        const clientResponse = await client.chat.completions.create({
          ...this.basePrompt,
          stream: true,
          tool_choice: { type: 'function', function: { name: mode.tool.name } },
          tools: [{ type: 'function', function: mode.tool }],
          messages,
        });

        const toolCalls: Array<{
          toolCallId: string;
          toolName: string;
        }> = [];

        return readableFromAsyncIterable(clientResponse).pipeThrough(
          new TransformStream<
            OpenAI.Chat.Completions.ChatCompletionChunk,
            LanguageModelStreamPart
          >({
            transform(chunk, controller) {
              if (chunk.choices?.[0].delta == null) {
                return;
              }

              const delta = chunk.choices[0].delta;

              if (delta.tool_calls == null) {
                return;
              }

              for (const toolCallDelta of delta.tool_calls) {
                const index = toolCallDelta.index;

                if (index !== 0) {
                  continue;
                }

                if (toolCalls[index] == null) {
                  toolCalls[index] = {
                    toolCallId: toolCallDelta.id ?? '', // TODO empty?
                    toolName: toolCallDelta.function?.name ?? '', // TODO empty?
                  };
                }

                const toolCall = toolCalls[index];

                const argumentsDelta = toolCallDelta.function?.arguments;

                if (argumentsDelta != null) {
                  controller.enqueue({
                    type: 'tool-call-delta',
                    toolCallId: toolCall.toolCallId,
                    toolName: toolCall.toolName,
                    argsTextDelta: argumentsDelta,
                  });
                }
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
