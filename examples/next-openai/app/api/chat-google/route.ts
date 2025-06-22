import { google } from '@ai-sdk/google';
import { convertToModelMessages, streamText, UIMessage } from 'ai';

export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const prompt = convertToModelMessages(messages);

  const result = streamText({
    model: google('gemini-2.0-flash'),
    prompt,
  });

  return result.toUIMessageStreamResponse();
}
