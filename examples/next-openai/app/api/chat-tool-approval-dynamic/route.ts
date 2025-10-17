import { dynamicWeatherWithApprovalAgent } from '@/agent/dynamic-weather-with-approval-agent';
import { validateUIMessages } from 'ai';

export async function POST(request: Request) {
  const body = await request.json();

  console.dir(body.messages, { depth: Infinity });

  return dynamicWeatherWithApprovalAgent.respond({
    messages: await validateUIMessages({ messages: body.messages }),
  });
}
