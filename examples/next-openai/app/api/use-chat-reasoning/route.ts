import { fireworks } from '@ai-sdk/fireworks';
import { extractReasoningMiddleware, streamText, wrapLanguageModel } from 'ai';

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages } = await req.json();

  console.log(JSON.stringify(messages, null, 2));

  const result = streamText({
    model: wrapLanguageModel({
      model: fireworks('accounts/fireworks/models/deepseek-r1'),
      middleware: extractReasoningMiddleware({ tagName: 'think' }),
    }),
    messages,
  });

  // const result = streamText({
  //   model: deepseek('deepseek-reasoner'),
  //   messages,
  // });

  // const result = streamText({
  //   model: anthropic('research-claude-flannel'),
  //   messages,
  //   providerOptions: {
  //     anthropic: {
  //       thinking: { type: 'enabled', budgetTokens: 12000 },
  //     } satisfies AnthropicProviderOptions,
  //   },
  // });

  return result.toDataStreamResponse({
    sendReasoning: true,
  });
}
