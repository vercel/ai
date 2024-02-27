import OpenAI from 'openai';
import {
  ErrorStreamPart,
  LanguageModel,
  LanguageModelPrompt,
  LanguageModelStreamPart,
} from '../../function';
import { ChatPrompt } from '../../function/language-model/prompt/chat-prompt';
import { InstructionPrompt } from '../../function/language-model/prompt/instruction-prompt';
import { tryParseJSON } from '../../function/util/try-json-parse';
import { readableFromAsyncIterable } from '../../streams';
import { convertToOpenAIChatPrompt } from './openai-chat-prompt';

export interface OpenAIChatMessageGeneratorSettings {
  id: string;
  maxTokens?: number;
  client?: OpenAI;
}

export class OpenAIChatLanguageModel implements LanguageModel {
  readonly settings: OpenAIChatMessageGeneratorSettings;

  constructor(settings: OpenAIChatMessageGeneratorSettings) {
    this.settings = settings;
  }

  get client() {
    return (
      this.settings.client ||
      new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      })
    );
  }

  async doGenerate({ prompt }: { prompt: LanguageModelPrompt }) {
    const openaiResponse = await this.client.chat.completions.create({
      model: this.settings.id,
      max_tokens: this.settings.maxTokens,
      messages: convertToOpenAIChatPrompt(prompt),
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
    prompt: LanguageModelPrompt;
  }): Promise<{
    jsonText: string;
  }> => {
    const openaiResponse = await this.client.chat.completions.create({
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
            description: 'Convert the previous message to JSON',
            parameters: schema,
          },
        },
      ],
    });

    return {
      jsonText:
        // TODO handle null case
        openaiResponse.choices[0].message.tool_calls?.[0].function.arguments!,
    };
  };

  async doStream({
    prompt,
    tools,
  }: {
    prompt: string | InstructionPrompt | ChatPrompt;
    tools?: Array<{
      name: string;
      description?: string;
      parameters: Record<string, unknown>;
    }>;
  }): Promise<ReadableStream<LanguageModelStreamPart>> {
    const openaiResponse = await this.client.chat.completions.create({
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
                toolCallId: toolCall.id ?? null,
                name: toolCall.function.name,
                args,
              });
            }
          }
        },
      }),
    );
  }

  async doStreamJsonText({
    schema,
    prompt,
  }: {
    schema: Record<string, unknown>;
    prompt: string | InstructionPrompt | ChatPrompt;
  }): Promise<
    ReadableStream<
      { type: 'json-text-delta'; textDelta: string } | ErrorStreamPart
    >
  > {
    const openaiResponse = await this.client.chat.completions.create({
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
            description: 'Convert the previous message to JSON',
            parameters: schema,
          },
        },
      ],
    });

    return readableFromAsyncIterable(openaiResponse).pipeThrough(
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
}
