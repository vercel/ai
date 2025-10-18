import { weatherAgent } from '@/agent/weather-agent';
import { createAgentStreamUIResponse } from 'ai';

export async function POST(request: Request) {
  const { messages } = await request.json();

  return createAgentStreamUIResponse({
    agent: weatherAgent,
    messages,
  });
}
