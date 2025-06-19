import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';

// Allow streaming responses up to 60 seconds
export const maxDuration = 60;

export async function POST(req: Request) {
  const { prompt } = await req.json();

  const result = streamText({
    model: openai('gpt-4o-mini'),
    maxSteps: 10,
    experimental_continueSteps: true,
    system:
      `You write in the style of great, modern authors. ` +
      `Write a book in Markdown format. ` +
      `First write a table of contents. ` +
      `Then write each chapter. ` +
      `Each chapter MUST HAVE at least 1000 words.`,
    prompt: `Write a book about ${prompt}.`,
  });

  return result.toDataStreamResponse();
}
