import { claudeCodeHarnessAgent } from '@/agent/harness/claude-code-agent';
import {
  loadHarnessSession,
  saveHarnessSession,
} from '@/util/harness-session-store';
import { createUIMessageStreamResponse, toUIMessageStream } from 'ai';

/*
 * REST endpoint demonstrating cross-process harness session resume.
 *
 * Flow per request:
 *   1. `useChat` POSTs `{ id: chatId, messages }`.
 *   2. We look up any persisted `{ sessionId, state }` for this chatId.
 *   3. Extract the most recent user message text and stream a turn.
 *      Presence of stored state turns this into a resume against the
 *      same sandbox; absence creates a fresh session.
 *   4. Detach + persist runs inside `consumeSseStream`, which tees the
 *      response body and resolves only after the stream has fully
 *      ended. `after()` is unsuitable here because it can fire as soon
 *      as the route returns the `Response` object — long before the
 *      bridge has produced any turn events — which would race detach
 *      against the in-flight turn.
 */
export async function POST(request: Request) {
  console.log(`[POST ${Date.now()}] entered`);
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

  const stored = await loadHarnessSession(chatId);

  const session = await claudeCodeHarnessAgent.createSession({
    sessionId: stored?.sessionId,
    resumeFrom: stored?.state,
  });

  const result = await claudeCodeHarnessAgent.stream({ session, prompt });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({ stream: result.stream }),
    consumeSseStream: async ({ stream }) => {
      console.log(`[CSS ${Date.now()}] consumeSseStream invoked`);
      try {
        const reader = stream.getReader();
        while (true) {
          const { done } = await reader.read();
          if (done) break;
        }
      } catch {
        // Reader errors are surfaced through the stream itself; we still
        // need to detach so the sandbox state is preserved.
      }
      console.log(`[CSS ${Date.now()}] drain done, calling detach`);

      try {
        const state = await session.detach();
        console.log(`[CSS ${Date.now()}] detach returned, calling save`);
        await saveHarnessSession({
          chatId,
          sessionId: session.sessionId,
          state,
        });
        console.log(`[CSS ${Date.now()}] save returned`);
      } catch (err) {
        console.error('[harness-claude-code] failed to detach + save:', err);
      }
    },
  });
}
