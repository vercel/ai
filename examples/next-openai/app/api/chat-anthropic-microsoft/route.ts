import { createAgentUIStreamResponse } from 'ai';
import { createAnthropicMicrosoftAgent } from '@/agent/anthropic-microsoft-agent';

export async function POST(req: Request) {
  const { messages } = await req.json();

  const agent = createAnthropicMicrosoftAgent();

  return createAgentUIStreamResponse({
    agent,
    messages,
    sendSources: true,
  });
}
