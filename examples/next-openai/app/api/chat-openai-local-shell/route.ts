import { openaiLocalShellAgent } from '@/agent/openai-local-shell-agent';
import { createAgentStreamResponse } from 'ai';

export async function POST(req: Request) {
  const { messages } = await req.json();

  return createAgentStreamResponse({
    agent: openaiLocalShellAgent,
    messages,
  });
}
