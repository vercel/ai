import {
  Agent,
  DRIVE_QUEUE_PREFIX,
  type FxHarnessAgentMessage,
} from '@/agent/fx/basic';
import { sendBackstop } from '@/lib/drive-queue';
import { isStoredAgentSession } from '@/lib/stored-agent-session';
import { getWorld } from '@/lib/world';
import { getHarnessE2EErrorMessage } from '@/util/harness-ui-stream';
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
} from 'ai';

export const maxDuration = 800;

export async function POST(request: Request) {
  const body: {
    id?: string;
    messages: FxHarnessAgentMessage[];
    session?: unknown;
  } = await request.json();

  if (!body.id) {
    return new Response('Missing chat id', { status: 400 });
  }
  if (!isStoredAgentSession(body.session)) {
    return new Response('Missing session', { status: 400 });
  }
  const storedSession = body.session;
  const messages = await convertToModelMessages(body.messages);

  return createUIMessageStreamResponse({
    stream: createUIMessageStream<FxHarnessAgentMessage>({
      execute: async ({ writer }) => {
        const session = await Agent.createSession(storedSession);
        /*
         * `stream()` runs the turn's drive in this process. The backstop,
         * sent before the drive starts, continues the turn in a background
         * drive if this process dies or the drive yields at its deadline.
         */
        await sendBackstop({
          world: getWorld(),
          queuePrefix: DRIVE_QUEUE_PREFIX,
          runId: session.runId,
        });
        const result = await Agent.stream({ session, messages });

        /*
         * The result's own `toUIMessageStream()` is used instead of the
         * standalone helper, since only it turns a retraction (the output of
         * an attempt that a retry replaces) into a `reset-step` chunk.
         */
        writer.merge(
          result.toUIMessageStream({
            onError: getHarnessE2EErrorMessage,
            originalMessages: body.messages,
          }),
        );
      },
      onError: getHarnessE2EErrorMessage,
    }),
  });
}
