import { mistral } from '@ai-sdk/mistral';
import { experimental_getRealtimeToolDefinitions } from 'ai';
import { rollDice } from '../../mistral-realtime/tools';

// Local example: authenticate users and authorize session ownership in production.
export async function POST() {
  const session = await mistral.experimental_realtime.createSession({
    model: 'mistral-small-latest',
    sessionConfig: {
      instructions:
        'You are a helpful voice assistant. Respond briefly. ' +
        'When asked to roll a die, call rollDice and read the result aloud.',
      tools: await experimental_getRealtimeToolDefinitions({
        tools: { rollDice },
      }),
      voice: 'voice_447',
      providerOptions: {
        mistral: {
          stt: { model: 'voxtral-mini-transcribe-realtime-3' },
          tts: { model: 'voxtral-mini-tts-3' },
        },
      },
    },
  });

  return Response.json(session, {
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function DELETE(request: Request) {
  const sessionId = new URL(request.url).searchParams.get('sessionId');
  if (sessionId == null || sessionId.trim() === '') {
    return Response.json({ error: 'sessionId is required' }, { status: 400 });
  }

  await mistral.experimental_realtime.closeSession({ sessionId });
  return new Response(null, { status: 204 });
}
