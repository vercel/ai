import { weatherValibotAgent } from '@/agent/weather-valibot-agent';
import { createAgentStreamResponse } from 'ai';

export async function POST(request: Request) {
  const { messages } = await request.json();

  console.dir(messages, { depth: Infinity });

  return createAgentStreamResponse({
    agent: weatherValibotAgent,
    messages,
  });
}
