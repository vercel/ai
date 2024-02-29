import { nanoid } from 'nanoid';
import OpenAI from 'openai';
import {
  ErrorStreamPart,
  LanguageModel,
  LanguageModelSettings,
  LanguageModelStreamPart,
  ObjectMode,
} from '../../core';
import { injectJsonSchemaIntoInstructionPrompt } from '../../core/language-model/generate-object/inject-json-schema-into-instruction-prompt';
import { ChatPrompt } from '../../core/language-model/prompt/chat-prompt';
import { InstructionPrompt } from '../../core/language-model/prompt/instruction-prompt';
import { tryParseJSON } from '../../core/util/try-json-parse';
import { readableFromAsyncIterable } from '../../streams';
import {
  convertInstructionPromptToOpenAIChatPrompt,
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

  async doGenerate({ prompt }: { prompt: ChatPrompt | InstructionPrompt }) {
    const client = await this.getClient();
    const openaiResponse = await client.chat.completions.create({
      model: this.settings.id,
      max_tokens: this.settings.maxTokens,
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
      stream: true,
      model: this.settings.id,
      max_tokens: this.settings.maxTokens,
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

    switch (type) {
      case 'json': {
        const client = await this.getClient();
        const openaiResponse = await client.chat.completions.create({
          model: this.settings.id,
          max_tokens: this.settings.maxTokens,

          response_format: { type: 'json_object' },
          messages: convertInstructionPromptToOpenAIChatPrompt(prompt),
        });

        // TODO extract standard response processing
        return {
          text: openaiResponse.choices[0].message.content ?? undefined,
        };
      }

      case 'tool': {
        const client = await this.getClient();
        const openaiResponse = await client.chat.completions.create({
          model: this.settings.id,
          max_tokens: this.settings.maxTokens,

          messages: convertToOpenAIChatPrompt(prompt),
          tool_choice: { type: 'function', function: { name: mode.tool.name } },
          tools: [{ type: 'function', function: mode.tool }],
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
    schema,
    prompt,
  }: {
    schema: Record<string, unknown>;
    prompt: InstructionPrompt;
  }): Promise<
    ReadableStream<
      { type: 'json-text-delta'; textDelta: string } | ErrorStreamPart
    >
  > {
    const outputMode = this.settings.objectMode ?? 'tool';

    switch (outputMode) {
      case 'json': {
        const client = await this.getClient();
        const clientResponse = await client.chat.completions.create({
          stream: true,
          model: this.settings.id,
          max_tokens: this.settings.maxTokens,

          response_format: { type: 'json_object' },
          messages: convertInstructionPromptToOpenAIChatPrompt(
            injectJsonSchemaIntoInstructionPrompt({
              prompt,
              schema,
            }),
          ),
        });

        return readableFromAsyncIterable(clientResponse).pipeThrough(
          new TransformStream<
            OpenAI.Chat.Completions.ChatCompletionChunk,
            { type: 'json-text-delta'; textDelta: string } | ErrorStreamPart
          >({
            transform(chunk, controller) {
              if (chunk.choices?.[0].delta == null) {
                return;
              }

              const delta = chunk.choices[0].delta;

              if (delta.content != null) {
                controller.enqueue({
                  type: 'json-text-delta',
                  textDelta: delta.content,
                });
              }
            },
          }),
        );
      }

      case 'tool': {
        const client = await this.getClient();
        const clientResponse = await client.chat.completions.create({
          stream: true,
          model: this.settings.id,
          max_tokens: this.settings.maxTokens,
          messages: convertToOpenAIChatPrompt(prompt),
          tool_choice: {
            type: 'function',
            function: { name: 'json' },
          },
          tools: [
            {
              type: 'function',
              function: {
                // TODO enable setting name/description through json mode setting
                name: 'json',
                description: 'Respond with a JSON object.',
                parameters: schema,
              },
            },
          ],
        });

        return readableFromAsyncIterable(clientResponse).pipeThrough(
          new TransformStream<
            OpenAI.Chat.Completions.ChatCompletionChunk,
            { type: 'json-text-delta'; textDelta: string } | ErrorStreamPart
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

                const argumentsDelta = toolCallDelta.function?.arguments;

                if (argumentsDelta != null) {
                  controller.enqueue({
                    type: 'json-text-delta',
                    textDelta: argumentsDelta,
                  });
                }
              }
            },
          }),
        );
      }

      default: {
        const _exhaustiveCheck: never = outputMode;
        throw new Error(`Unsupported objectMode: ${_exhaustiveCheck}`);
      }
    }
  }
}
