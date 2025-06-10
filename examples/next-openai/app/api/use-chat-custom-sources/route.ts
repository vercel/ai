import { openai } from '@ai-sdk/openai';
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
  UIMessage,
} from 'ai';

type MyUIMessage = UIMessage<{ x: number }, { test: { value: string } }>;

export async function POST(req: Request) {
  const { messages }: { messages: MyUIMessage[] } = await req.json();

  const stream = createUIMessageStream<MyUIMessage>({
    execute: ({ writer }) => {
      writer.write({ type: 'start' });

      // write a custom url source to the stream:
      writer.write({
        type: 'source-url',
        sourceId: 'source-1',
        url: 'https://example.com',
        title: 'Example Source',
      });

      writer.write({
        type: 'data-test',
        data: {
          value: 'test',
        },
      });

      writer.write({
        type: 'metadata',
        metadata: {
          x: 12,
        },
      });

      const result = streamText({
        model: openai('gpt-4o'),
        messages: convertToModelMessages(messages),
      });

      writer.merge(result.toUIMessageStream<MyUIMessage>({ sendStart: false }));
    },
    originalMessages: messages,
    onFinish: options => {
      console.log('onFinish', JSON.stringify(options, null, 2));
    },
  });

  return createUIMessageStreamResponse({ stream });
}
