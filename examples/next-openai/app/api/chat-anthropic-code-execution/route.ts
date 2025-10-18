import { anthropicCodeExecutionAgent } from '@/agent/anthropic-code-execution-agent';
import { createAgentStreamUIResponse } from 'ai';

export async function POST(request: Request) {
  const { messages } = await request.json();

  console.dir(messages, { depth: Infinity });

  return createAgentStreamUIResponse({
    agent: anthropicCodeExecutionAgent,
    messages,
  });
}
