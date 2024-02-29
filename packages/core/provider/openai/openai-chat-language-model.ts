import { nanoid } from 'nanoid';
import OpenAI from 'openai';
import {
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionCreateParamsStreaming,
} from 'openai/resources';
import {
  LanguageModel,
  LanguageModelSettings,
  LanguageModelStreamPart,
  ObjectMode,
} from '../../core';
import { tryParseJSON } from '../../core/util/try-json-parse';
import { readableFromAsyncIterable } from '../../streams';
import { convertToOpenAIChatPrompt } from './convert-to-openai-chat-prompt';

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

  private getDoGenerateArgs({
    mode,
    prompt,
  }: Parameters<
    LanguageModel['doGenerate']
  >[0]): ChatCompletionCreateParamsNonStreaming {
    const type = mode.type;
    const messages = convertToOpenAIChatPrompt(prompt);

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
          response_format: { type: 'json_object' },
          messages,
        };
      }

      case 'object-tool': {
        return {
          ...this.basePrompt,
          tool_choice: { type: 'function', function: { name: mode.tool.name } },
          tools: [{ type: 'function', function: mode.tool }],
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

    const completion = await client.chat.completions.create(
      this.getDoGenerateArgs({ mode, prompt }),
    );

    const message = completion.choices[0].message;

    return {
      text: message.content ?? undefined,
      toolCalls: message.tool_calls?.map(toolCall => ({
        toolCallId: toolCall.id,
        toolName: toolCall.function.name,
        args: toolCall.function.arguments!,
      })),
    };
  }

  private getDoStreamArgs({
    mode,
    prompt,
  }: Parameters<
    LanguageModel['doGenerate']
  >[0]): ChatCompletionCreateParamsStreaming {
    const type = mode.type;
    const messages = convertToOpenAIChatPrompt(prompt);

    switch (type) {
      case 'regular': {
        return {
          stream: true,
          ...this.basePrompt,
          messages,
          // TODO tools
        };
      }

      case 'object-json': {
        return {
          stream: true,
          ...this.basePrompt,
          response_format: { type: 'json_object' },
          messages,
        };
      }

      case 'object-tool': {
        return {
          stream: true,
          ...this.basePrompt,
          tool_choice: { type: 'function', function: { name: mode.tool.name } },
          tools: [{ type: 'function', function: mode.tool }],
          messages,
        };
      }

      default: {
        const _exhaustiveCheck: never = type;
        throw new Error(`Unsupported type: ${_exhaustiveCheck}`);
      }
    }
  }

  async doStream({
    mode,
    prompt,
  }: Parameters<LanguageModel['doStream']>[0]): Promise<
    ReadableStream<LanguageModelStreamPart>
  > {
    const client = await this.getClient();

    const response = await client.chat.completions.create(
      this.getDoStreamArgs({ mode, prompt }),
    );

    const toolCalls: Array<{
      id?: string;
      type?: 'function';
      function?: {
        name?: string;
        arguments?: string;
      };
    }> = [];

    return readableFromAsyncIterable(response).pipeThrough(
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

              // send delta
              controller.enqueue({
                type: 'tool-call-delta',
                toolCallId: toolCall.id ?? '', // TODO empty?
                toolName: toolCall.function?.name ?? '', // TODO empty?
                argsTextDelta: toolCallDelta.function?.arguments ?? '', // TODO empty?
              });

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
}
