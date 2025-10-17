import { weatherAgent } from '@/agent/weather-agent';
import { validateUIMessages } from 'ai';

export async function POST(request: Request) {
  const body = await request.json();

  return weatherAgent.respond({
    messages: await validateUIMessages({ messages: body.messages }),
  });
}
