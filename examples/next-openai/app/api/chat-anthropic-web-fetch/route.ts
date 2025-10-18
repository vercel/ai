import { anthropicWebFetchAgent } from '@/agent/anthropic-web-fetch-agent';
import { createAgentStreamUIResponse } from 'ai';

export async function POST(request: Request) {
  const { messages } = await request.json();

  return createAgentStreamUIResponse({
    agent: anthropicWebFetchAgent,
    messages,
    sendSources: true,
  });
}
