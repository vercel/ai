import { openaiProgrammaticToolCallingAgent } from '@/agent/openai/programmatic-tool-calling-agent';
import { createAgentUIStreamResponse } from 'ai';

export async function POST(request: Request) {
  const { messages } = await request.json();

  return createAgentUIStreamResponse({
    agent: openaiProgrammaticToolCallingAgent,
    uiMessages: messages,
  });
}
