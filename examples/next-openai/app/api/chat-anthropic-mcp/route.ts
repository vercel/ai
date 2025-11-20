import { anthropicMcpAgent } from '@/agent/anthropic-mcp-agent';
import { createAgentUIStreamResponse } from 'ai';

export async function POST(request: Request) {
  const { messages } = await request.json();

  console.dir(messages, { depth: Infinity });

  return createAgentUIStreamResponse({
    agent: anthropicMcpAgent,
    messages,
  });
}
