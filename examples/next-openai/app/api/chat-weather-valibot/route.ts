import { weatherValibotAgent } from '@/agent/weather-valibot-agent';
import { validateUIMessages } from 'ai';

export async function POST(request: Request) {
  const body = await request.json();

  console.dir(body.messages, { depth: Infinity });

  return weatherValibotAgent.respond({
    messages: await validateUIMessages({ messages: body.messages }),
  });
}
