import { weatherWithApprovalAgent } from '@/agent/weather-with-approval-agent';
import { createAgentStreamResponse } from 'ai';

export async function POST(request: Request) {
  const { messages } = await request.json();

  console.dir(messages, { depth: Infinity });

  return createAgentStreamResponse({
    agent: weatherWithApprovalAgent,
    messages,
  });
}
