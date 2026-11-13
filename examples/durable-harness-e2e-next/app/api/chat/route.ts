import { Agent, type PiHarnessAgentMessage } from '@/agent/pi/basic';
import { isStoredAgentSession } from '@/lib/stored-agent-session';
import { getHarnessE2EErrorMessage } from '@/util/harness-ui-stream';
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  toUIMessageStream,
} from 'ai';

export const maxDuration = 800;

export async function POST(request: Request) {
  const body: {
    id?: string;
    messages: PiHarnessAgentMessage[];
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
    stream: createUIMessageStream<PiHarnessAgentMessage>({
      execute: async ({ writer }) => {
        const session = await Agent.createSession(storedSession);
        const result = await Agent.stream({ session, messages });

        writer.merge(
          toUIMessageStream({
            stream: result.stream,
            onError: getHarnessE2EErrorMessage,
            originalMessages: body.messages,
          }),
        );
      },
      onError: getHarnessE2EErrorMessage,
    }),
  });
}
