import { anthropicToolsAgent } from '@/agent/anthropic-tools-agent';
import { createAgentUIStreamResponse } from 'ai';

export async function POST(request: Request) {
  const { messages } = await request.json();

  return createAgentUIStreamResponse({
    agent: anthropicToolsAgent,
    messages,
  });
}
