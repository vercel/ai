import { weatherAgent } from '@/agent/weather-agent';
import { createAgentStreamResponse } from 'ai';

export async function POST(request: Request) {
  const { messages } = await request.json();

  return createAgentStreamResponse({
    agent: weatherAgent,
    messages,
  });
}
