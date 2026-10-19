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
    system: `You are a product research assistant. When the user provides a product URL, use the extract_product tool to get structured data.

For every field in the response, report the confidence score alongside the value. Confidence scores range from 0.0 (uncertain) to 1.0 (high certainty).

If any field has confidence below 0.85, explicitly flag it: "This field has lower confidence and should be verified before relying on it."

If a field is missing from the response, say so. A missing field is more useful than a guessed one.

Do not invent or supplement data beyond what the extraction returns.`,
    messages: await convertToModelMessages(messages),
    tools: {
      extract_product: extractProduct,
    },
    stopWhen: isStepCount(3),
  });

  return result.toUIMessageStreamResponse();
}
