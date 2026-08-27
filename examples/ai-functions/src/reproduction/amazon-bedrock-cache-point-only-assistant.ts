import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { safeParseJSON } from '@ai-sdk/provider-utils';
import { generateText } from 'ai';

const modelId = 'us.anthropic.claude-sonnet-4-5-20250929-v1:0';
const bedrockCacheError = 'There is nothing available to cache.';
const reproductionSignal =
  'REPRODUCED: two consecutive Bedrock requests rejected the cachePoint-only assistant message: There is nothing available to cache.';

type Attempt = {
  requestHasCachePointOnlyAssistantMessage: boolean;
  responseStatus?: number;
  responseBody?: string;
};

function hasCachePointOnlyAssistantMessage(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || !('messages' in value)) {
    return false;
  }

  const messages = value.messages;
  if (!Array.isArray(messages)) {
    return false;
  }

  return messages.some(message => {
    if (
      typeof message !== 'object' ||
      message === null ||
      !('role' in message) ||
      message.role !== 'assistant' ||
      !('content' in message) ||
      !Array.isArray(message.content)
    ) {
      return false;
    }

    const content: unknown[] = message.content;
    return (
      content.length > 0 &&
      content.every(
        (part: unknown) =>
          typeof part === 'object' && part !== null && 'cachePoint' in part,
      )
    );
  });
}

async function main() {
  const attempts: Attempt[] = [];

  const provider = createAmazonBedrock({
    fetch: async (input, init) => {
      const attempt = attempts.at(-1);
      if (attempt == null) {
        throw new Error('No active reproduction attempt.');
      }

      if (typeof init?.body === 'string') {
        const parsedBody = await safeParseJSON({ text: init.body });
        attempt.requestHasCachePointOnlyAssistantMessage =
          parsedBody.success &&
          hasCachePointOnlyAssistantMessage(parsedBody.value);
      }

      const response = await fetch(input, init);
      attempt.responseStatus = response.status;
      attempt.responseBody = await response.clone().text();
      return response;
    },
  });

  for (let index = 0; index < 2; index++) {
    const attempt: Attempt = {
      requestHasCachePointOnlyAssistantMessage: false,
    };
    attempts.push(attempt);

    try {
      await generateText({
        model: provider(modelId),
        maxOutputTokens: 16,
        messages: [
          {
            role: 'user',
            content: 'Give one short greeting.',
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
          {
            role: 'user',
            content: 'Use five words or fewer.',
          },
        ],
      });
    } catch (error) {
      if (
        attempt.requestHasCachePointOnlyAssistantMessage &&
        attempt.responseStatus === 400 &&
        attempt.responseBody?.includes(bedrockCacheError)
      ) {
        continue;
      }

      throw error;
    }

    if (attempt.requestHasCachePointOnlyAssistantMessage) {
      throw new Error(
        'Bedrock accepted the cachePoint-only assistant message, so the reported final failure did not occur.',
      );
    }
  }

  const reproducedOnEveryAttempt = attempts.every(
    attempt =>
      attempt.requestHasCachePointOnlyAssistantMessage &&
      attempt.responseStatus === 400 &&
      attempt.responseBody?.includes(bedrockCacheError),
  );

  if (reproducedOnEveryAttempt) {
    console.error(reproductionSignal);
    process.exitCode = 1;
    return;
  }

  console.log('PASS: Bedrock completed both follow-up requests.');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
