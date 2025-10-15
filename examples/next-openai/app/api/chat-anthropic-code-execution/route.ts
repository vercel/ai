import { anthropicCodeExecutionAgent } from '@/agent/anthropic-code-execution';
import { validateUIMessages } from 'ai';

export async function POST(request: Request) {
  const body = await request.json();

  console.dir(body.messages, { depth: Infinity });

  return anthropicCodeExecutionAgent.respond({
    messages: await validateUIMessages({ messages: body.messages }),
  });
}
