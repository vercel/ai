import { openCodeHarnessAgent } from '@/agent/harness/opencode/basic-agent';
import { getHarnessE2EErrorMessage } from '@/util/harness-ui-stream';
import {
  resumeOrCreateSession,
  stopAndPersist,
} from '@/util/harness-resume-store';
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  toUIMessageStream,
  type UIMessage,
} from 'ai';

export async function POST(request: Request) {
  const body: {
    id?: string;
    messages: UIMessage[];
  } = await request.json();

  if (!body.id) {
    return new Response('Missing chat id', { status: 400 });
  }
  const chatId = body.id;
  const messages = await convertToModelMessages(body.messages);

  return createUIMessageStreamResponse({
    stream: createUIMessageStream({
      execute: async ({ writer }) => {
        const { session, sandboxSession } = await resumeOrCreateSession({
          agent: openCodeHarnessAgent,
          chatId,
          ports: [4000],
        });

        const result = await openCodeHarnessAgent.stream({ session, messages });

        writer.merge(
          toUIMessageStream({
            stream: result.stream,
            onError: getHarnessE2EErrorMessage,
            /*
             * Stop the harness and sandbox after the turn. The next request
             * resumes the sandbox before starting the harness again.
             */
            onFinish: () => stopAndPersist({ chatId, session, sandboxSession }),
          }),
        );
      },
      onError: getHarnessE2EErrorMessage,
    }),
  });
}
