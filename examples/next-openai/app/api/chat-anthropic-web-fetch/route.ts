import { anthropicWebFetchAgent } from '@/agent/anthropic-web-fetch-agent';
import { createAgentStreamResponse } from 'ai';

export async function POST(request: Request) {
  const { messages } = await request.json();

  return createAgentStreamResponse({
    agent: anthropicWebFetchAgent,
    messages,
    sendSources: true,
  });
}
