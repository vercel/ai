import { openaiSteeringAgent } from '@/agent/openai/steering-agent';
import { createAgentUIStreamResponse } from 'ai';
import { endSteering, startSteering } from './steering-store';

export async function POST(req: Request) {
  const body = await req.json();

  if (typeof body.id !== 'string') {
    return Response.json({ error: 'Missing chat id' }, { status: 400 });
  }

  const steering = startSteering(body.id);

  try {
    return await createAgentUIStreamResponse({
      agent: openaiSteeringAgent,
      uiMessages: body.messages,
      experimental_steering: steering,
      onEnd: () => endSteering(body.id, steering),
    });
  } catch (error) {
    // onEnd only runs for streams that started, e.g. not for invalid messages:
    endSteering(body.id, steering);
    throw error;
  }
}
