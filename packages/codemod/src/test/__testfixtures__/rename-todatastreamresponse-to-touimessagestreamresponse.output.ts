// @ts-nocheck
import { streamText } from 'ai';

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = streamText({
    model: openai('gpt-4o'),
    messages,
  });

  return result.toUIMessageStreamResponse();
}

// Another example
const stream = streamText({ model, prompt });
const response = stream.toUIMessageStreamResponse({ 
  status: 200,
  headers: { 'custom': 'header' }
}); 