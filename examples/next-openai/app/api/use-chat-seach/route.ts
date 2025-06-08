import { anthropic } from '@ai-sdk/anthropic';
import { streamText, tool } from 'ai';
import { z } from 'zod';

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = streamText({
    model: anthropic('claude-4-sonnet-20250514'),
    // model: anthropic('claude-3-5-sonnet-latest'),
    messages,
    toolCallStreaming: true,
    maxSteps: 5, // multi-steps for server-side tools
    tools: {
      web_search: anthropic.tools.webSearch_20250305(),
      // server-side tool with execute function:
    },
  });

  return result.toDataStreamResponse();
}
