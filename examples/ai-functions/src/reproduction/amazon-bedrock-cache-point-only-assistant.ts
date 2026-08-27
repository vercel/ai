import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { generateText, type ModelMessage } from 'ai';

const providerError =
  'There is nothing available to cache. Please remove the invalid cache point and try again.';
const reproductionSignal =
  'ISSUE #19851 REPRODUCED: Bedrock rejected cachePoint-only assistant history on 2 consecutive requests';

function hasCachePointOnlyAssistant(body: string): boolean {
  const request = JSON.parse(body) as {
    messages?: Array<{
      role?: string;
      content?: Array<Record<string, unknown>>;
    }>;
  };

  return (
    request.messages?.some(
      message =>
        message.role === 'assistant' &&
        message.content?.length === 1 &&
        message.content[0].cachePoint != null,
    ) ?? false
  );
}

async function main() {
  const requestBodies: string[] = [];
  const bedrock = createAmazonBedrock({
    fetch: async (input, init) => {
      if (typeof init?.body === 'string') {
        requestBodies.push(init.body);
      }
      return fetch(input, init);
    },
  });

  const poisonedHistory = [
    {
      role: 'user',
      content: [{ type: 'text', text: 'Think hard then answer' }],
    },
    {
      role: 'assistant',
      content: [
        {
          type: 'reasoning',
          text: 'Let me consider the options',
        },
      ],
      providerOptions: {
        bedrock: { cachePoint: { type: 'default' } },
      },
    },
  ] satisfies ModelMessage[];

  const followUps = ['Hello?', 'Are you there?'];
  let cachePointErrors = 0;

  for (let index = 0; index < followUps.length; index++) {
    const messages: ModelMessage[] = [
      ...poisonedHistory,
      ...followUps.slice(0, index + 1).map(text => ({
        role: 'user' as const,
        content: [{ type: 'text' as const, text }],
      })),
    ];

    try {
      await generateText({
        model: bedrock('us.anthropic.claude-sonnet-4-5-20250929-v1:0'),
        messages,
        maxOutputTokens: 16,
        maxRetries: 0,
      });
    } catch (error) {
      if (error instanceof Error && error.message === providerError) {
        cachePointErrors++;
        continue;
      }
      throw error;
    }
  }

  const malformedRequestCount = requestBodies.filter(
    hasCachePointOnlyAssistant,
  ).length;

  if (
    cachePointErrors === followUps.length &&
    malformedRequestCount === followUps.length
  ) {
    console.error(reproductionSignal);
    throw new Error(reproductionSignal);
  }

  if (cachePointErrors > 0) {
    throw new Error(
      `Unexpected partial reproduction: ${cachePointErrors} cache-point errors and ${malformedRequestCount} malformed requests`,
    );
  }

  console.log(
    'Issue not reproduced: both requests completed without a cachePoint-only assistant message failure.',
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
