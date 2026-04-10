import {
  convertToModelMessages,
  isStepCount,
  streamText,
  UIMessage,
} from 'ai';
import { openai } from '@ai-sdk/openai';
import { extractProduct } from '@/lib/shopgraph';

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const result = streamText({
    model: openai('gpt-4o'),
    system:
      'You are a product research assistant. When the user provides a product URL, use the extract_product tool to get structured data. Always report confidence scores alongside the data. If any field has confidence below 0.85, explicitly note that it should be verified.',
    messages: await convertToModelMessages(messages),
    tools: {
      extract_product: extractProduct,
    },
    stopWhen: isStepCount(3),
  });

  return result.toUIMessageStreamResponse();
}
