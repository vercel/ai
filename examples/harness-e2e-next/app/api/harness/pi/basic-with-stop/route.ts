import { piHarnessAgent } from '@/agent/harness/pi/basic-agent';
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
        const session = await resumeOrCreateSession(piHarnessAgent, chatId);

        const result = await piHarnessAgent.stream({ session, messages });

        writer.merge(
          toUIMessageStream({
            stream: result.stream,
            onError: getHarnessE2EErrorMessage,
            // Stop the session at the end of the turn so the next request resumes
            // from the persisted snapshot rather than attaching to a parked bridge.
            onFinish: () => stopAndPersist(chatId, session),
          }),
        );
      },
      onError: getHarnessE2EErrorMessage,
    }),
  });
}
