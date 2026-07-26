import { amazonBedrock } from '@ai-sdk/amazon-bedrock';
import {
  convertToModelMessages,
  streamText,
  type ModelMessage,
  type UIMessage,
} from 'ai';

export async function POST(req: Request) {
  try {
    const { messages }: { messages: UIMessage[] } = await req.json();

    const modelMessages = await convertToModelMessages(messages);

    const guardedMessages = applyGuardContentToLastUserMessage(modelMessages);

    const result = streamText({
      model: amazonBedrock('anthropic.claude-3-haiku-20240307-v1:0'),
      messages: guardedMessages,
      maxOutputTokens: 500,
      temperature: 0.7,
      providerOptions: {
        bedrock: {
          guardrailConfig: {
            guardrailIdentifier:
              process.env.BEDROCK_GUARDRAIL_IDENTIFIER ?? '<guardrail-id>',
            guardrailVersion: process.env.BEDROCK_GUARDRAIL_VERSION ?? 'DRAFT',
            trace: 'enabled' as const,
          },
        },
      },
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    console.error('Bedrock API Error:', error);
    return new Response(
      JSON.stringify({
        error: 'Bedrock API failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
}

function applyGuardContentToLastUserMessage(
  messages: ModelMessage[],
): ModelMessage[] {
  const lastUserIndex = findLastIndex(messages, m => m.role === 'user');
  if (lastUserIndex === -1) return messages;

  return messages.map((message, index) => {
    if (index !== lastUserIndex || message.role !== 'user') return message;

    const content = message.content;

    if (typeof content === 'string') {
      return {
        ...message,
        content: [
          {
            type: 'text',
            text: content,
            providerOptions: {
              bedrock: {
                guardContent: true,
              },
            },
          },
        ],
      };
    }

    return {
      ...message,
      content: content.map(part => {
        if (part.type === 'text') {
          return {
            ...part,
            providerOptions: {
              ...part.providerOptions,
              bedrock: {
                ...part.providerOptions?.bedrock,
                guardContent: true,
              },
            },
          };
        }
        return part;
      }),
    };
  });
}

function findLastIndex<T>(
  array: T[],
  predicate: (value: T) => boolean,
): number {
  for (let i = array.length - 1; i >= 0; i--) {
    if (predicate(array[i])) return i;
  }
  return -1;
}
