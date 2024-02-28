import { nanoid } from 'nanoid';
import OpenAI from 'openai';
import {
  ErrorStreamPart,
  LanguageModel,
  LanguageModelSettings,
  LanguageModelStreamPart,
} from '../../core';
import { ChatPrompt } from '../../core/language-model/prompt/chat-prompt';
import { InstructionPrompt } from '../../core/language-model/prompt/instruction-prompt';
import { tryParseJSON } from '../../core/util/try-json-parse';
import { readableFromAsyncIterable } from '../../streams';
import { convertToOpenAIChatPrompt } from './openai-chat-prompt';

export interface OpenAIChatLanguageModelSettings extends LanguageModelSettings {
  id: string;
  client: () => Promise<OpenAI>;
}

export class OpenAIChatLanguageModel implements LanguageModel {
  readonly settings: OpenAIChatLanguageModelSettings;

  constructor(settings: OpenAIChatLanguageModelSettings) {
    this.settings = settings;
  }

  private getClient(): Promise<OpenAI> {
    return this.settings.client();
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

  doGenerateJsonText = async ({
    schema,
    prompt,
  }: {
    schema: Record<string, unknown>;
    prompt: InstructionPrompt;
  }): Promise<{
    jsonText: string;
  }> => {
    const client = await this.getClient();
    const openaiResponse = await client.chat.completions.create({
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
}
