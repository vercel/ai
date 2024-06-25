import { openai } from '@ai-sdk/openai';
import { StreamData, StreamingTextResponse, streamText } from 'ai';

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = await streamText({
    model: openai('gpt-4-turbo'),
    messages,
  });

  // optional: use stream data
  const data = new StreamData();

  data.append('initialized call');

  return new StreamingTextResponse(
    result.toAIStream({
      onFinal() {
        data.append('call completed');
        data.close();
      },
    }),
    {},
    data,
  );
}
