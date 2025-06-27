import { openai } from '@ai-sdk/openai';
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
  UIMessage,
} from 'ai';

export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const modelMessages = convertToModelMessages(messages);

  const stream = createUIMessageStream({
    execute: ({ writer }) => {
      throw new Error('test');
      // const result = streamText({
      //   model: anthropic('claude-sonnet-4-20250514'),
      //   messages: modelMessages,
      //   onError: (err) => {
      //     const errorMessage = 'Error during streamText';
      //     logger.error({ err }, errorMessage);
      //   },
      // });
      // writer.merge(result.toUIMessageStream());
    },
    onFinish: () => {
      // error message doesn't show if onFinish isn't defined
    },
    onError: err => {
      const errorMessage = 'Error during createUIMessageStream';
      console.error(errorMessage, err);
      return errorMessage;
    },
  });

  return createUIMessageStreamResponse({ stream });
}
