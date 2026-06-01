import { claudeCodeDetachHarnessAgent } from '@/agent/harness/claude-code/detach-agent';
import {
  detachAndPersist,
  resumeOrCreateSession,
} from '@/util/harness-resume-store';
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

  const session = await resumeOrCreateSession(
    claudeCodeDetachHarnessAgent,
    chatId,
  );

  const result = await claudeCodeDetachHarnessAgent.stream({
    session,
    messages,
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      // Detach (and stop the sandbox) at the end of the turn — the next request
      // resumes from the snapshot in `rerun` mode rather than attaching.
      onFinish: () => detachAndPersist(chatId, session),
    }),
  });
}
