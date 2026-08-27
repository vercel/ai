import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { generateText, type ModelMessage } from 'ai';

const modelId = 'us.anthropic.claude-sonnet-4-5-20250929-v1:0';
const bedrockError = 'There is nothing available to cache';
const failureSignal =
  'ISSUE #19851 REPRODUCED: Bedrock rejected a cachePoint-only assistant message';

type CapturedRequest = {
  body: {
    messages?: Array<{
      role?: string;
      content?: Array<Record<string, unknown>>;
    }>;
  };
  responseBody: string;
  status: number;
};

const capturedRequests: CapturedRequest[] = [];

const bedrock = createAmazonBedrock({
  fetch: async (input, init) => {
    const response = await fetch(input, init);
    const requestBody =
      typeof init?.body === 'string' ? JSON.parse(init.body) : {};

    capturedRequests.push({
      body: requestBody,
      responseBody: await response.clone().text(),
      status: response.status,
    });

    return response;
  },
});

const poisonedHistory: ModelMessage[] = [
  {
    role: 'user',
    content: [{ type: 'text', text: 'First question' }],
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
    content: [{ type: 'text', text: 'Follow-up question' }],
  },
];

async function request(messages: ModelMessage[]) {
  return generateText({
    model: bedrock(modelId),
    messages,
    maxOutputTokens: 16,
  });
}

function isCachePointOnlyAssistant(
  message: NonNullable<CapturedRequest['body']['messages']>[number],
) {
  return (
    message.role === 'assistant' &&
    message.content?.length === 1 &&
    message.content[0] != null &&
    'cachePoint' in message.content[0]
  );
}

async function main() {
  const providerErrors: unknown[] = [];
  const successfulTexts: string[] = [];

  for (const messages of [
    poisonedHistory,
    [
      ...poisonedHistory,
      {
        role: 'user' as const,
        content: [{ type: 'text' as const, text: 'Another follow-up' }],
      },
    ],
  ]) {
    try {
      successfulTexts.push((await request(messages)).text);
    } catch (error) {
      providerErrors.push(error);
    }
  }

  const poisonedRequests = capturedRequests.slice(0, 2);
  const malformedRequestWasSent = poisonedRequests.every(request =>
    request.body.messages?.some(isCachePointOnlyAssistant),
  );

  if (providerErrors.length === 0) {
    if (
      poisonedRequests.length !== 2 ||
      malformedRequestWasSent ||
      successfulTexts.some(text => text.length === 0)
    ) {
      throw new Error(
        `The requests completed but did not omit the cachePoint-only assistant message as expected. Captured: ${JSON.stringify(
          capturedRequests,
        )}`,
      );
    }

    console.log(
      'Bedrock completed both follow-up requests after the filtered assistant turn was omitted.',
    );
    return;
  }

  const bedrockRejectedBothRequests =
    providerErrors.length === 2 &&
    poisonedRequests.length === 2 &&
    poisonedRequests.every(
      request =>
        request.status === 400 && request.responseBody.includes(bedrockError),
    );

  if (!malformedRequestWasSent || !bedrockRejectedBothRequests) {
    throw new Error(
      `Expected two Bedrock 400 responses for the cachePoint-only assistant message. Captured: ${JSON.stringify(
        capturedRequests,
      )}`,
    );
  }

  const correctedResult = await request([
    {
      role: 'user',
      content: [
        { type: 'text', text: 'First question' },
        { type: 'text', text: 'Follow-up question' },
        { type: 'text', text: 'Another follow-up' },
      ],
    },
  ]);

  if (correctedResult.text.length === 0) {
    throw new Error('The corrected Bedrock request returned no text.');
  }

  const observedMessage = JSON.parse(poisonedRequests[0].responseBody).message;
  console.error(
    `${failureSignal}: "${observedMessage}". The equivalent history without the filtered assistant turn succeeded.`,
  );
  process.exitCode = 1;
}

main().catch(error => {
  console.error(error);
  process.exitCode = 2;
});
