import { claudeCodeHarnessAgent } from '@/agent/harness/claude-code-agent';
import {
  getHarnessSession,
  setHarnessSession,
} from '@/util/harness-session-registry';
import { createUIMessageStreamResponse, toUIMessageStream } from 'ai';

/*
 * REST endpoint for the harness chat example.
 *
 * `useChat` POSTs `{ id: chatId, messages }`. One harness session is kept warm
 * per chat (see `harness-session-registry`): the first message of a chat
 * creates a session and registers it; every later message reuses the same live
 * session. The sandbox stays up between turns, so work the agent did earlier
 * (e.g. a cloned repo) is still there on the next message — no detach, snapshot,
 * or resume per turn.
 */
export async function POST(request: Request) {
  const body = (await request.json()) as {
    id?: string;
    messages: Array<{
      role: 'user' | 'assistant' | 'system';
      parts?: Array<{ type: string; text?: string }>;
    }>;
  };

  if (!body.id) {
    return new Response('Missing chat id', { status: 400 });
  }
  const chatId = body.id;

  const lastUser = [...body.messages].reverse().find(m => m.role === 'user');
  const prompt =
    lastUser?.parts
      ?.filter(p => p.type === 'text')
      .map(p => p.text ?? '')
      .join('') ?? '';
  if (prompt.length === 0) {
    return new Response('Missing user message', { status: 400 });
  }

  let session = getHarnessSession(chatId);
  if (session == null) {
    session = await claudeCodeHarnessAgent.createSession();
    setHarnessSession(chatId, session);
  }

  const result = await claudeCodeHarnessAgent.stream({ session, prompt });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({ stream: result.stream }),
  });
}
