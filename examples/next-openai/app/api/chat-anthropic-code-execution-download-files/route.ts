import { anthropic, AnthropicProviderOptions } from '@ai-sdk/anthropic';
import { convertToModelMessages, streamText, validateUIMessages } from 'ai';

export async function POST(request: Request) {
  const { messages } = await request.json();
  const uiMessages = await validateUIMessages({ messages });

  const result = streamText({
    model: anthropic('claude-sonnet-4-5'),
    tools: {
      code_execution: anthropic.tools.codeExecution_20250825(),
    },
    providerOptions: {
      anthropic: {
        container: {
          skills: [{ type: 'anthropic', skillId: 'xlsx' }],
        },
      } satisfies AnthropicProviderOptions,
    },
    messages: convertToModelMessages(uiMessages),
  });

  return result.toUIMessageStreamResponse({
    sendSources: true, // to display 'source-execution-file' part in the client.
  });
}
