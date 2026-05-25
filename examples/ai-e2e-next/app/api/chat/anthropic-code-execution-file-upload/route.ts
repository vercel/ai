import { anthropicCodeExecutionFileUploadAgent } from '@/agent/anthropic/code-execution-file-upload-agent';
import type { AnthropicMessageMetadata } from '@ai-sdk/anthropic';
import {
  createAgentUIStreamResponse,
  validateUIMessages,
  type UIMessage,
} from 'ai';

export async function POST(request: Request) {
  const { messages } = await request.json();

  const uiMessages = await validateUIMessages<
    UIMessage<{ containerId?: string }>
  >({ messages });

  const lastAssistantMessage = uiMessages.findLast(
    message => message.role === 'assistant',
  );

  return createAgentUIStreamResponse({
    agent: anthropicCodeExecutionFileUploadAgent,
    uiMessages,
    messageMetadata({ part }) {
      if (part.type !== 'finish-step') {
        return;
      }

      const anthropicContainer = (
        part.providerMetadata?.anthropic as unknown as AnthropicMessageMetadata
      )?.container;

      if (anthropicContainer?.id == null) {
        return;
      }

      return {
        containerId: anthropicContainer.id,
      };
    },
    options: {
      containerId: lastAssistantMessage?.metadata?.containerId,
    },
  });
}
