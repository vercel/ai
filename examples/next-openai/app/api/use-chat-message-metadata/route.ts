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
          model: 'gpt-4o', // initial model id
        };
      }

      // send additional model information on finish-step:
      if (part.type === 'finish-step') {
        return {
          model: part.response.modelId, // update with the actual model id
        };
      }

      // when the message is finished, send additional information:
      if (part.type === 'finish') {
        return {
          duration: Date.now() - startTimestamp,
          totalTokens: part.totalUsage.totalTokens,
          finishReason: part.finishReason,
        };
      }
    },
  });
}
