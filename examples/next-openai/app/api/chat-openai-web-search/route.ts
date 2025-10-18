import { openaiWebSearchAgent } from '@/agent/openai-web-search-agent';
import { createAgentStreamResponse } from 'ai';

export async function POST(req: Request) {
  const { messages } = await req.json();

  return createAgentStreamResponse({
    agent: openaiWebSearchAgent,
    messages,
    sendSources: true,
  });
}
