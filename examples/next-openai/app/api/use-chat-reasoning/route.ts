import { anthropic } from '@ai-sdk/anthropic';
import { deepseek } from '@ai-sdk/deepseek';
import { streamText } from 'ai';

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages } = await req.json();

  // const result = streamText({
  //   model: deepseek('deepseek-reasoner'),
  //   messages,
  // });

  const result = streamText({
    model: anthropic('research-claude-flannel'),
    messages,
    providerOptions: {
      anthropic: {
        thinking: { type: 'enabled', budgetTokens: 12000 },
      },
    },
  });

  return result.toDataStreamResponse({
    sendReasoning: true,
  });
}
