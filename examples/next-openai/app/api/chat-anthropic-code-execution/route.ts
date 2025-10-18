import { anthropicCodeExecutionAgent } from '@/agent/anthropic-code-execution-agent';
import { createAgentUIStreamResponse } from 'ai';

export async function POST(request: Request) {
  const { messages } = await request.json();

  console.dir(messages, { depth: Infinity });

  return createAgentUIStreamResponse({
    agent: anthropicCodeExecutionAgent,
    messages,
  });
}
