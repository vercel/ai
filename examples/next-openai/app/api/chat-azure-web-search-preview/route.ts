import { azure } from '@ai-sdk/azure';
import { convertToModelMessages, streamText, UIMessage } from 'ai';

export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const prompt = convertToModelMessages(messages);

  const result = streamText({
    model: azure.responses('gpt-4.1-mini'),
    prompt,
    tools:{
      web_search_preview:azure.tools.webSearchPreview({
        searchContextSize:"medium",
      }),
    }
  });

  return result.toUIMessageStreamResponse();
}
