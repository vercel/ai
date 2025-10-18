import { anthropicWebSearchAgent } from '@/agent/anthropic-web-search-agent';
import { createAgentStreamUIResponse } from 'ai';

export async function POST(request: Request) {
  const { messages } = await request.json();

  return createAgentStreamUIResponse({
    agent: anthropicWebSearchAgent,
    messages,
    sendSources: true,
  });
}
