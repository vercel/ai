import { agent } from '@/agent/pi/basic';

/**
 * Cancels the session's running turn. The turn ends with finish reason
 * `other` (raw finish reason `cancelled`) once the drive running it, in any
 * process, noticed the cancel. Responds with 409 and the user-facing message
 * if the session has no running turn.
 */
export async function POST(request: Request) {
  const body: { runId?: unknown } = await request.json();
  if (typeof body.runId !== 'string') {
    return new Response('Missing runId', { status: 400 });
  }

  const session = await agent.createSession({ runId: body.runId });
  try {
    await agent.cancel({ session });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('has no running turn')
    ) {
      return new Response('No running turn to cancel', { status: 409 });
    }
    throw error;
  }
  return new Response(null, { status: 204 });
}
