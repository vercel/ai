import { openai } from '@ai-sdk/openai';
import { convertToModelMessages, streamText, UIMessage } from 'ai';
import { ExampleMetadata } from './example-metadata-schema';

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const result = streamText({
    model: openai('gpt-4o'),
    prompt: convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse({
    messageMetadata: ({ part }): ExampleMetadata | undefined => {
      // send custom information to the client on start:
      if (part.type === 'start') {
        return {
          createdAt: Date.now(),
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
          totalTokens: part.totalUsage.totalTokens,
          finishReason: part.finishReason,
        };
      }
    },
  });
}
