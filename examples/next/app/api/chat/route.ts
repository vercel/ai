import { callWeatherApi } from '@/util/call-weather-api';
import { MyUIMessage } from '@/util/chat-schema';
import { readChat, saveChat } from '@util/chat-store';
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateId,
  stepCountIs,
  streamText,
  tool,
} from 'ai';
import z from 'zod/v4';

export async function POST(req: Request) {
  const { message, id }: { message: MyUIMessage; id: string } =
    await req.json();

  const chat = await readChat(id);
  const messages = [...chat.messages, message];

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      // go through all messages, create a copy, replace data parts with
      // tool invocations
      const mappedMessages = messages.map(message => {
        return {
          ...message,
          parts: message.parts.map(part => {
            if (part.type === 'data-weather') {
              return {
                type: 'tool-invocation' as const,
                toolInvocation: {
                  toolCallId: part.id!,
                  toolName: 'getWeather',
                  state: 'result' as const,
                  args: { city: part.data.city },
                  result: part.data,
                },
              };
            }
            return part;
          }),
        };
      });

      // TODO introduce a data part mapping in convertToModelMessages
      const prompt = convertToModelMessages(mappedMessages);

      console.log('prompt', JSON.stringify(prompt, null, 2));

      const result = streamText({
        model: 'openai/gpt-4o',
        prompt,
        tools: {
          getWeather: tool({
            description: 'show the weather in a given city to the user',
            parameters: z.object({ city: z.string() }),
            async execute({ city }, { toolCallId }) {
              const result = await callWeatherApi({ city });

              // TODO: type safety
              writer.write({
                type: 'data-weather',
                id: toolCallId,
                data: result,
              });

              return result;
            },
          }),
        },
        stopWhen: stepCountIs(5),
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

                controller.enqueue(chunk);
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
