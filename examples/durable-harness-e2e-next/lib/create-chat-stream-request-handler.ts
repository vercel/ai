import { getHarnessE2EErrorMessage } from '@/util/harness-ui-stream';
import type { HarnessAgent } from '@ai-sdk/harness/agent';
import type { HarnessV2 } from '@ai-sdk/harness';
import { createUIMessageStreamResponse, type ToolSet } from 'ai';

/**
 * Reconnects a chat to its session's latest API response, e.g. after the
 * process that streamed it crashed: reads the response from the start of its
 * first turn, following it across drives and any follow-up turns until the
 * session settles (i.e. all queued turns finished or the current turn waits
 * for tool approval responses). The chat replays it from the beginning
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
export function createChatStreamRequestHandler<
  THarness extends HarnessV2,
  TUserTools extends ToolSet,
>({ agent }: { agent: HarnessAgent<THarness, TUserTools> }) {
  return async function GET(request: Request) {
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
  };
}
