import { openaiShellAgent } from '@/agent/openai-shell-agent';
import { createAgentUIStreamResponse } from 'ai';

export async function POST(req: Request) {
  const { messages } = await req.json();

  return createAgentUIStreamResponse({
    agent: openaiShellAgent,
    messages,
  });
}
