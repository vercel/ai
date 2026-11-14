import { agent } from '@/agent/fx/basic';
import { getHarnessE2EErrorMessage } from '@/util/harness-ui-stream';
import { createUIMessageStreamResponse } from 'ai';

export const maxDuration = 800;

/**
 * Reconnects a chat to its session's latest turn, e.g. after the process
 * that streamed it crashed: reads the turn from its start, following it
 * across drives until it finishes. The chat replays it from the beginning
 * (`resumeStreamIsReplay`), replacing the response it has shown so far.
 *
 * The session's run ID comes as the `runId` query parameter. Responds with
 * 204 if the session has no turn yet.
 *
 * The stream's `start` part carries no message ID, so the chat keeps the ID
 * of the response it reconnects.
 *
 * The result's own `toUIMessageStream()` is used instead of the standalone
 * helper, since only it turns a retraction (the output of an attempt that a
 * retry replaces, e.g. after a crash) into a `reset-step` chunk.
 */
export async function GET(request: Request) {
  const runId = new URL(request.url).searchParams.get('runId');
  if (!runId) {
    return new Response('Missing runId', { status: 400 });
  }

  const session = await agent.createSession({ runId });
  let result: Awaited<ReturnType<typeof agent.readStream>>;
  try {
    result = await agent.readStream({ session, abortSignal: request.signal });
  } catch (error) {
    if (error instanceof Error && error.message.includes('has no turn')) {
      return new Response(null, { status: 204 });
    }
    throw error;
  }

  return createUIMessageStreamResponse({
    stream: result.toUIMessageStream({ onError: getHarnessE2EErrorMessage }),
  });
}
