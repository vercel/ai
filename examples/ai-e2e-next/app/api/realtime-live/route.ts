import {
  openai,
  type Experimental_OpenAIRealtimeModelLiveOptions as OpenAIRealtimeModelLiveOptions,
} from '@ai-sdk/openai';
import type { Experimental_RealtimeSessionConfig } from 'ai';

// This local example needs application authentication before deployment.
// The server, never browser input, selects data-channel permissions.
export async function POST(request: Request) {
  const { sdp, sessionConfig } = (await request.json()) as {
    sdp: string;
    sessionConfig?: Experimental_RealtimeSessionConfig;
  };
  if (typeof sdp !== 'string' || sdp.length > 65536) {
    return Response.json({ error: 'Invalid SDP offer' }, { status: 400 });
  }
  const result = await openai
    .experimental_realtime('gpt-live-1')
    .doCreateWebRTCSession({
      sdp,
      sessionConfig: {
        ...sessionConfig,
        providerOptions: {
          ...sessionConfig?.providerOptions,
          openai: {
            ...(sessionConfig?.providerOptions?.openai as
              | OpenAIRealtimeModelLiveOptions
              | undefined),
            delegation: { type: 'client' },
            client: {
              dataChannel: {
                allowedClientEvents: [
                  'session.close',
                  'session.input_audio.mute',
                  'session.input_audio.unmute',
                  'session.instructions.append',
                  'session.thinking.append',
                  'session.commentary.append',
                ],
                allowedServerEvents: [
                  { type: 'session.started' },
                  { type: 'session.closed' },
                  { type: 'session.usage.updated' },
                  { type: 'session.delegation.created' },
                  { type: 'session.input_transcript.delta' },
                  { type: 'session.output_transcript.delta' },
                  { type: 'session.input_audio.muted' },
                  { type: 'session.input_audio.unmuted' },
                  { type: 'session.instructions.appended' },
                  { type: 'session.thinking.appended' },
                  { type: 'session.commentary.appended' },
                  { type: 'error' },
                ],
              },
            },
          } satisfies OpenAIRealtimeModelLiveOptions,
        },
      },
      abortSignal: request.signal,
    });
  return Response.json(result);
}
