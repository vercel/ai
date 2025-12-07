import { anthropicToolSearchAgent } from '@/agent/anthropic-tool-search-agent';
import { createAgentUIStreamResponse } from 'ai';

export async function POST(request: Request) {
  const { messages } = await request.json();

  return createAgentUIStreamResponse({
    agent: anthropicToolSearchAgent,
    messages,
  });
}
