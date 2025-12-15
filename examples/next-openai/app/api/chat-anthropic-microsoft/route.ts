import { createAgentUIStreamResponse } from 'ai';
import { createAnthropicMicrosoftAgent } from '@/agent/anthropic-microsoft-agent';

const agent = createAnthropicMicrosoftAgent();

export async function POST(req: Request) {
  const body = await req.json();

  return createAgentUIStreamResponse({
    agent,
    uiMessages: body.messages,
    sendSources: true,
  });
}
