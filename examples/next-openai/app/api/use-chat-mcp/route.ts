import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = streamText({
    model: openai.responses('gpt-4o'),
    messages,
    toolCallStreaming: true,
    maxSteps: 5,
    tools: {
      mcp: openai.tools.mcp({
        serverLabel: 'deepwiki',
        serverUrl: 'https://mcp.deepwiki.com/mcp',
        requireApproval: {
          always: {
            toolNames: ['ask_question'],
          },
        },
        allowedTools: ['ask_question'],
      }),
    },
  });

  return result.toDataStreamResponse();
}
