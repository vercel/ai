import { createModelCallToUIChunkTransform } from '@ai-sdk/workflow';
import { createUIMessageStreamResponse } from 'ai';
import type { NextRequest } from 'next/server';
import { getRun } from 'workflow/api';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  try {
    const { runId } = await params;
    const startIndex = Number(
      new URL(request.url).searchParams.get('startIndex') ?? '0',
    );
    if (!Number.isSafeInteger(startIndex) || startIndex < 0) {
      return Response.json(
        { error: 'startIndex must be a non-negative safe integer' },
        { status: 400 },
      );
    }

    const run = await getRun(runId);
    const readable = run
      .getReadable({ startIndex: 0 })
      .pipeThrough(
        createModelCallToUIChunkTransform({ uiStartIndex: startIndex }),
      );

    return createUIMessageStreamResponse({
      stream: readable,
      headers: {
        'x-workflow-run-id': runId,
      },
    });
  } catch (error) {
    console.error('Error reconnecting to chat stream:', error);
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
