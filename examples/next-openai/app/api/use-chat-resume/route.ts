import { openai } from '@ai-sdk/openai';
import { createDataStream, streamText } from 'ai';
import { after } from 'next/server';
import { createResumableStreamContext } from 'resumable-stream';

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

const redisUrl = process.env.KV_URL;

if (!redisUrl) {
  throw new Error('KV_URL environment variable is not set');
}

const streamContext = createResumableStreamContext({
  waitUntil: after,
});

export async function POST(req: Request) {
  const { id, messages } = await req.json();

  const stream = createDataStream({
    execute: (dataStream) => {
      const result = streamText({
        model: openai('gpt-4o'),
        messages,
      });

      result.mergeIntoDataStream(dataStream)
    }
  })



  return new Response(await streamContext.resumableStream(id, () => stream), {
    headers: {
      "Content-Type": "text/event-stream",
    },
  })
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (!id) {
    return new Response("id is required", { status: 400 });
  }

  const emptyStream = createDataStream({
    execute: () => { }
  })

  // return new Response(await streamContext.resumableStream(id, () => emptyStream))

  return new Response("wip")
}
