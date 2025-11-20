import { createAgentUIStreamResponse } from 'ai';
import { anthropicMicrosoftAgent } from '@/agent/anthropic-microsoft-agent';

export async function POST(req: Request) {
  const { messages } = await req.json();

  return createAgentUIStreamResponse({
    agent: anthropicMicrosoftAgent,
    messages,
    sendSources: true,
  });
}
