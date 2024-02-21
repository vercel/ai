import OpenAI from 'openai';
import { ChatPrompt, MessageStreamPart } from '../../function';
import { InstructionPrompt } from '../../function/prompt/instruction-prompt';
import { MessageGenerator } from '../../function/stream-message/message-generator';
import { convertToOpenAIChatPrompt } from './openai-chat-prompt';
import { readableFromAsyncIterable } from '../../streams';
import { tryParseJSON } from '../../function/util/try-json-parse';

export interface OpenAIChatMessageGeneratorSettings {
  id: string;
  maxTokens?: number;
  client?: OpenAI;
}

export class OpenAIChatMessageGenerator implements MessageGenerator {
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

  async doStreamText(
    prompt: string | InstructionPrompt | ChatPrompt,
  ): Promise<ReadableStream<MessageStreamPart>> {
    const openaiResponse = await this.client.chat.completions.create({
      model: this.settings.id,
      max_tokens: this.settings.maxTokens,
      stream: true,
      messages: convertToOpenAIChatPrompt(prompt),
    });

    return readableFromAsyncIterable(openaiResponse).pipeThrough(
      new TransformStream<
        OpenAI.Chat.Completions.ChatCompletionChunk,
        MessageStreamPart
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
            for (const toolCall of delta.tool_calls) {
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
