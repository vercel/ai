import { toUIMessageStream } from '@ai-sdk/langchain';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { ChatOpenAI } from '@langchain/openai';
import { createUIMessageStreamResponse } from 'ai';

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

export async function POST(req: Request) {
  const { prompt } = await req.json();

  const model = new ChatOpenAI({
    model: 'gpt-3.5-turbo-0125',
    temperature: 0,
  });

  const parser = new StringOutputParser();

  const stream = await model.pipe(parser).stream(prompt);

  return createUIMessageStreamResponse({
    stream: toUIMessageStream(stream),
  });
}
