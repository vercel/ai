import { Agent } from '@/agent/pi/basic';

/**
 * Crashes the process of the drive running the session's current turn, like
 * a real crash would: nothing is recorded, so recovery has to prove the
 * drive gone, e.g. from its dead process. Responds with 409 and the
 * user-facing message if there is no current drive to crash.
 */
export async function POST(request: Request) {
  const body: { runId?: unknown } = await request.json();
  if (typeof body.runId !== 'string') {
    return new Response('Missing runId', { status: 400 });
  }

  const session = await Agent.createSession({ runId: body.runId });
  try {
    await Agent.experimental_crash({ session });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('there is no current drive to crash')
    ) {
      return new Response('No current drive to crash', { status: 409 });
    }
    throw error;
  }
  return new Response(null, { status: 204 });
}
