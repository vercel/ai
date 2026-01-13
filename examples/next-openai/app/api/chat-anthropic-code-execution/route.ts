import { anthropicCodeExecutionAgent } from '@/agent/anthropic-code-execution-agent';
import { AnthropicMessageMetadata } from '@ai-sdk/anthropic';
import { createAgentUIStreamResponse, UIMessage, validateUIMessages } from 'ai';

export async function POST(request: Request) {
  const { messages } = await request.json();

  console.dir(messages, { depth: Infinity });

  const uiMessages = await validateUIMessages<
    UIMessage<{ containerId: string }>
  >({ messages });

  // get the last assistant message to enable reusing the container id
  const lastAssistantMessage = uiMessages.findLast(
    message => message.role === 'assistant',
  );

  return createAgentUIStreamResponse({
    agent: anthropicCodeExecutionAgent,
    uiMessages: messages,
    messageMetadata({ part }) {
      // LOG ALL PARTS TO DEBUG THE STREAM
      const partAny = part as any;
      if (
        part.type === 'text-start' ||
        part.type === 'text-delta' ||
        part.type === 'text-end'
      ) {
        console.log(`[STREAM] ${part.type} id=${partAny.id}`);
      } else if (
        part.type === 'tool-input-start' ||
        part.type === 'tool-call'
      ) {
        console.log(`[STREAM] ${part.type} toolName=${partAny.toolName}`);
      } else if (part.type === 'tool-result') {
        console.log(`[STREAM] ${part.type} toolCallId=${partAny.toolCallId}`);
      } else {
        console.log(`[STREAM] ${part.type}`);
      }

      // store the anthropic container id if a container was used
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
