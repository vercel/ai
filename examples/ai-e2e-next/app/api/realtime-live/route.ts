import { openai } from '@ai-sdk/openai';
import type { Experimental_RealtimeSessionConfig } from 'ai';

// Application authentication must protect this endpoint before deployment.
export async function POST(request: Request) {
  const { sdp, sessionConfig } = (await request.json()) as {
    sdp: string;
    sessionConfig?: Experimental_RealtimeSessionConfig;
  };
  if (typeof sdp !== 'string' || sdp.length > 65536) {
    return Response.json({ error: 'Invalid SDP offer' }, { status: 400 });
  }
  const result = await openai.live('gpt-live-1').doCreateWebRTCSession({
    sdp,
    sessionConfig,
    abortSignal: request.signal,
  });
  return Response.json(result);
}
