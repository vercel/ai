import { openaiLocalShellAgent } from '@/agent/openai-local-shell-agent';
import { createAgentStreamUIResponse } from 'ai';

export async function POST(req: Request) {
  const { messages } = await req.json();

  return createAgentStreamUIResponse({
    agent: openaiLocalShellAgent,
    messages,
  });
}
