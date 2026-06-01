import { codexHarnessAgent } from '@/agent/harness/codex/basic-agent';
import {
  getHarnessSession,
  setHarnessSession,
} from '@/util/harness-session-registry';
import {
  convertToModelMessages,
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

  let session = getHarnessSession(chatId);
  if (session == null) {
    session = await codexHarnessAgent.createSession();
    setHarnessSession(chatId, session);
  }

  const result = await codexHarnessAgent.stream({ session, messages });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({ stream: result.stream }),
  });
}
