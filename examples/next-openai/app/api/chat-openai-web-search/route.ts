import { openaiWebSearchAgent } from '@/agent/openai-web-search-agent';
import { createAgentStreamUIResponse } from 'ai';

export async function POST(req: Request) {
  const { messages } = await req.json();

  return createAgentStreamUIResponse({
    agent: openaiWebSearchAgent,
    messages,
    sendSources: true,
  });
}
