import { callWeatherApi } from '@/util/call-weather-api';
import { Message } from '@/util/chat-schema';
import { readChat, saveChat } from '@util/chat-store';
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
  tool,
} from 'ai';
import z from 'zod/v4';

export async function POST(req: Request) {
  const { message, id }: { message: Message; id: string } = await req.json();

  const chat = await readChat(id);
  const messages = [...chat.messages, message];

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      // go through all messages, create a copy, replace data parts with
      // tool invocations
      const mappedMessages = messages.map(message => {
        return {
          ...message,
          parts: message.parts.flatMap(part => {
            if (part.type === 'data-weather') {
              if (
                part.data.status === 'generating' ||
                part.data.status === 'calling api'
              ) {
                return []; // ignore generating parts
              }

              const weather = part.data.weather;

              return [
                {
                  type: 'tool-getWeatherInformation' as const,
                  toolCallId: part.id!,
                  state: 'output-available' as const,
                  input: { city: weather.city },
                  output: part.data.weather,
                },
                // {
                //   type: 'text' as const,
                //   text: `The weather in ${weather.city} is currently ${weather.weather}, with a temperature of ${weather.temperatureInCelsius}°C.`,
                // },
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
        model: 'vertex/gemini-2.0-flash-001',
        prompt,
        tools: {
          getWeather: tool({
            description: 'show the weather in a given city to the user',
            inputSchema: z.object({ city: z.string() }),

            onInputStart(options) {
              writer.write({
                type: 'data-weather',
                id: options.toolCallId,
                data: { status: 'generating' },
              });
            },

            onInputAvailable(options) {
              writer.write({
                type: 'data-weather',
                id: options.toolCallId,
                data: { status: 'calling api' },
              });
            },

            async execute({ city }, { toolCallId }) {
              const weather = await callWeatherApi({ city });

              writer.write({
                type: 'data-weather',
                id: toolCallId,
                data: { status: 'available', weather },
              });

              return weather;
            },
          }),
        },
      });

      result.consumeStream(); // TODO always consume the stream even when the client disconnects

      writer.merge(
        result
          .toUIMessageStream({
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
                  chunk.type === 'tool-output-available' ||
                  chunk.type === 'tool-input-available' ||
                  chunk.type === 'tool-input-delta' ||
                  chunk.type === 'tool-input-start'
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
    originalMessages: messages,
    onFinish: ({ messages }) => {
      saveChat({ id, messages });
    },
  });

  return createUIMessageStreamResponse({ stream });
}
