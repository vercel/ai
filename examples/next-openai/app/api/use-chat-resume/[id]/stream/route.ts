import { loadStreams } from '@/util/chat-store';
import { createUIMessageStream, JsonToSseTransformStream } from 'ai';
import { after } from 'next/server';
import { createResumableStreamContext } from 'resumable-stream';

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!id) {
    return new Response('id is required', { status: 400 });
  }

  const streamIds = await loadStreams(id);

  if (!streamIds.length) {
    return new Response('No streams found', { status: 204 });
  }

  const recentStreamId = streamIds.at(-1);

  if (!recentStreamId) {
    return new Response('No recent stream found', { status: 204 });
  }

  const emptyDataStream = createUIMessageStream({
    execute: () => {},
  });

  const streamContext = createResumableStreamContext({
    waitUntil: after,
  });

  return new Response(
    await streamContext.resumableStream(recentStreamId, () =>
      emptyDataStream.pipeThrough(new JsonToSseTransformStream()),
    ),
  );
}
