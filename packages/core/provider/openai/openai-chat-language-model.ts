import OpenAI from 'openai';
import { ChatPrompt } from '../../function/language-model/prompt/chat-prompt';
import { InstructionPrompt } from '../../function/language-model/prompt/instruction-prompt';
import { LanguageModel } from '../../function/language-model/language-model';
import { convertToOpenAIChatPrompt } from './openai-chat-prompt';
import { readableFromAsyncIterable } from '../../streams';
import { tryParseJSON } from '../../function/util/try-json-parse';
import { ToolDefinition } from '../../function/language-model/tool/tool-definition';
import { MessageGeneratorStreamPart } from '../../function/dist';

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

  async generate() {
    return {
      text: 'hello',
    };
  }

  async stream({
    prompt,
    tools,
  }: {
    prompt: string | InstructionPrompt | ChatPrompt;
    tools?: Array<ToolDefinition<string, unknown>>;
  }): Promise<ReadableStream<MessageGeneratorStreamPart>> {
    const openaiResponse = await this.client.chat.completions.create({
      stream: true,
      model: this.settings.id,
      max_tokens: this.settings.maxTokens,
      messages: convertToOpenAIChatPrompt(prompt),
      tools: tools?.map(tool => ({
        type: 'function',
        function: {
          name: tool.name,
          arguments: JSON.stringify(tool.parameters.getJsonSchema()),
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
        MessageGeneratorStreamPart
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
                id: toolCall.id ?? null,
                name: toolCall.function.name,
                args,
              });
            }
          }
        },
      }),
    );
  }
}
