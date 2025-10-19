import { anthropicWebSearchAgent } from '@/agent/anthropic-web-search-agent';
import { createAgentUIStreamResponse } from 'ai';

export async function POST(request: Request) {
  const { messages } = await request.json();

  return createAgentUIStreamResponse({
    agent: anthropicWebSearchAgent,
    messages,
    sendSources: true,
  });
}
