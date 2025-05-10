import { openai } from '@ai-sdk/openai';
import { convertToModelMessages, streamText, UIMessage } from 'ai';

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const prompt = convertToModelMessages(messages);

  const result = streamText({
    model: openai('gpt-4o'),
    prompt,
  });

  let startTimestamp!: number;
  return result.toDataStreamResponse({
    messageMetadata: ({ part }) => {
      // send custom information to the client on start:
      if (part.type === 'start') {
        startTimestamp = Date.now();

        return {
          createdAt: startTimestamp,
          model: 'openai/gpt-4o',
        };
      }

      // when the message is finished, send additional information:
      if (part.type === 'finish') {
        return {
          duration: Date.now() - startTimestamp,
          usage: part.totalUsage,
          finishReason: part.finishReason,
        };
      }
    },
  });
}
