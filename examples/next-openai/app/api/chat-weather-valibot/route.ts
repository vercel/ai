import { weatherValibotAgent } from '@/agent/weather-valibot-agent';
import { createAgentStreamUIResponse } from 'ai';

export async function POST(request: Request) {
  const { messages } = await request.json();

  console.dir(messages, { depth: Infinity });

  return createAgentStreamUIResponse({
    agent: weatherValibotAgent,
    messages,
  });
}
