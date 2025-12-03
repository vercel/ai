import { weatherValibotAgent } from '@/agent/weather-valibot-agent';
import { createAgentUIStreamResponse } from 'ai';

export async function POST(request: Request) {
  const { messages } = await request.json();

  console.dir(messages, { depth: Infinity });

  return createAgentUIStreamResponse({
    agent: weatherValibotAgent,
    messages,
  });
}
