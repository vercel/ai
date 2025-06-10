import { callWeatherApi } from '@/util/call-weather-api';
import { MyUIMessage } from '@/util/chat-schema';
import { readChat, saveChat } from '@util/chat-store';
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateId,
  streamText,
  tool,
} from 'ai';
import z from 'zod/v4';

export async function POST(req: Request) {
  const { message, id }: { message: MyUIMessage; id: string } =
    await req.json();

  const chat = await readChat(id);
  const messages = [...chat.messages, message];

  const stream = createUIMessageStream<MyUIMessage>({
    execute: async ({ writer }) => {
      // go through all messages, create a copy, replace data parts with
      // tool invocations
      const mappedMessages = messages.map(message => {
        return {
          ...message,
          parts: message.parts.flatMap(part => {
            if (part.type === 'data-weather') {
              // TODO what if generating?
              const result2 = part.data.result!;
              return [
                {
                  type: 'tool-invocation' as const,
                  toolInvocation: {
                    toolCallId: part.id!,
                    toolName: 'getWeather',
                    state: 'result' as const,
                    args: { city: result2.city },
                    result: part.data,
                  },
                },
                {
                  type: 'text' as const,
                  text: `The weather in ${result2.city} is currently ${result2.weather}, with a temperature of ${result2.temperatureInCelsius}°C.`,
                },
              ];
            }
            return [part];
          }),
        };
      });

      // TODO introduce a data part mapping in convertToModelMessages
      const prompt = convertToModelMessages(mappedMessages);

      console.log('prompt', JSON.stringify(prompt, null, 2));

      const result = streamText({
        model: 'openai/gpt-4o',
        prompt,
        toolCallStreaming: true, // TODO remove
        tools: {
          getWeather: tool({
            description: 'show the weather in a given city to the user',
            parameters: z.object({ city: z.string() }),

            onArgsStreamingStart(options) {
              writer.write({
                type: 'data-weather',
                id: options.toolCallId,
                data: { status: 'generating' },
              });
            },

            async execute({ city }, { toolCallId }) {
              const result = await callWeatherApi({ city });

              writer.write({
                type: 'data-weather',
                id: toolCallId,
                data: { status: 'available', result },
              });

              return result;
            },
          }),
        },
      });

      result.consumeStream(); // TODO always consume the stream even when the client disconnects

      writer.merge(
        result
          .toUIMessageStream({
            newMessageId: generateId(), // TODO simplify
            messageMetadata: ({ part }) => {
              if (part.type === 'start') {
                return { createdAt: Date.now() };
              }
            },
          })
          // TODO this will go away in the future:
          .pipeThrough(
            new TransformStream({
              transform(chunk, controller) {
                // filter out tool related information
                if (
                  chunk.type === 'tool-result' ||
                  chunk.type === 'tool-call' ||
                  chunk.type === 'tool-call-delta' ||
                  chunk.type === 'tool-call-streaming-start'
                ) {
                  return;
                }

                controller.enqueue(chunk as any);
              },
            }),
          ),
      );
    },

    // save the chat when the stream is finished
    originalMessages: messages, // TODO BUG MESSAGE ID IS MISSING
    onFinish: ({ messages }) => {
      // TODO fix type safety
      saveChat({ id, messages: messages as MyUIMessage[] });
    },
  });

  return createUIMessageStreamResponse({ stream });
}
