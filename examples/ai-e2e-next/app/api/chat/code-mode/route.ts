import { codeModeAgent } from '@/agent/code-mode/code-mode-agent';
import { createAgentUIStreamResponse } from 'ai';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const { messages } = await request.json();

  return createAgentUIStreamResponse({
    agent: codeModeAgent,
    uiMessages: messages,
  });
}
