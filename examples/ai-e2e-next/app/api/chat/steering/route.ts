import { openaiSteeringAgent } from '@/agent/openai/steering-agent';
import { createAgentUIStreamResponse } from 'ai';
import { endSteering, startSteering } from './steering-store';

export async function POST(req: Request) {
  const body = await req.json();
  const steering = startSteering(body.id);

  return createAgentUIStreamResponse({
    agent: openaiSteeringAgent,
    uiMessages: body.messages,
    experimental_steering: steering,
    onEnd: () => endSteering(body.id, steering),
  });
}
