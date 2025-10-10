import { weatherWithApprovalAgent } from '@/agent/weather-with-approval-agent';
import { validateUIMessages } from 'ai';

export async function POST(request: Request) {
  const body = await request.json();

  console.dir(body.messages, { depth: Infinity });

  return weatherWithApprovalAgent.respond({
    messages: await validateUIMessages({ messages: body.messages }),
  });
}
