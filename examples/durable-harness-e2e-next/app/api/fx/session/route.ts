import { agent } from '@/agent/fx/basic';
import { createSandboxSession } from '@/lib/sandbox';
import type { StoredAgentSession } from '@/lib/stored-agent-session';

export const maxDuration = 300;

/**
 * Creates the agent session of a chat, with a new sandbox, and returns what
 * the browser stores to continue it. The chat ID becomes the session ID.
 */
export async function POST(request: Request) {
  const body: { chatId?: string } = await request.json();
  if (!body.chatId) {
    return new Response('Missing chat id', { status: 400 });
  }

  const session = await agent.createSession({
    sessionId: body.chatId,
    sandboxSession: await createSandboxSession(),
  });

  return Response.json({
    sessionId: session.sessionId,
    sandboxId: session.sandboxId,
    runId: session.runId,
  } satisfies StoredAgentSession);
}
