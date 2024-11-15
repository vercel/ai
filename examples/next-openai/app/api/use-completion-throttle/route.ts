import { simulateReadableStream } from 'ai/test';

export async function POST(req: Request) {
  return new Response(
    simulateReadableStream({
      initialDelayInMs: 0, // Delay before the first chunk
      chunkDelayInMs: 0, // Delay between chunks
      chunks: [
        ...Array(5000).fill(`0:"T "\n`),
        `e:{"finishReason":"stop","usage":{"promptTokens":20,"completionTokens":50},"isContinued":false}\n`,
        `d:{"finishReason":"stop","usage":{"promptTokens":20,"completionTokens":50}}\n`,
      ],
    }).pipeThrough(new TextEncoderStream()),
    {
      status: 200,
      headers: {
        'X-Vercel-AI-Data-Stream': 'v1',
        'Content-Type': 'text/plain; charset=utf-8',
      },
    },
  );
}
