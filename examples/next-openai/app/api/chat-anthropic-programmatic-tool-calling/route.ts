import { anthropicProgrammaticToolCallingAgent } from '@/agent/anthropic-programmatic-tool-calling-agent';
import { AnthropicMessageMetadata } from '@ai-sdk/anthropic';
import { createAgentUIStreamResponse, UIMessage, validateUIMessages } from 'ai';

export async function POST(request: Request) {
  const { messages } = await request.json();

  console.dir(messages, { depth: Infinity });

  const uiMessages = await validateUIMessages<
    UIMessage<{ containerId: string }>
  >({ messages });

  const lastAssistantMessage = uiMessages.findLast(
    message => message.role === 'assistant',
  );

  return createAgentUIStreamResponse({
    agent: anthropicProgrammaticToolCallingAgent,
    uiMessages: messages,
    messageMetadata({ part }) {
      if (part.type === 'finish-step') {
        const anthropicContainer = (
          part.providerMetadata
            ?.anthropic as unknown as AnthropicMessageMetadata
        )?.container;

        return {
          containerId: anthropicContainer?.id,
        };
      }
    },
    options: {
      containerId: lastAssistantMessage?.metadata?.containerId,
    },
  });
}
