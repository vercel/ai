import { openaiNamespaceAgent } from '@/agent/openai/namespace-agent';
import { createAgentUIStreamResponse } from 'ai';

export async function POST(req: Request) {
  const body = await req.json();

  return createAgentUIStreamResponse({
    agent: openaiNamespaceAgent,
    uiMessages: body.messages,
  });
}
