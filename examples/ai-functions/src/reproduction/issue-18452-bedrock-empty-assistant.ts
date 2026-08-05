import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import {
  APICallError,
  convertToModelMessages,
  generateText,
  type UIMessage,
} from 'ai';
import fs from 'node:fs';

const initialMessages: UIMessage[] = [
  {
    id: 'u1',
    role: 'user',
    parts: [{ type: 'text', text: 'think hard then answer' }],
  },
  {
    id: 'a1',
    role: 'assistant',
    parts: [
      {
        type: 'reasoning',
        text: 'Let me consider the options',
      },
    ],
  },
  {
    id: 'u2',
    role: 'user',
    parts: [{ type: 'text', text: 'hello?' }],
  },
];

const validationError = JSON.parse(
  fs.readFileSync(
    new URL(
      '../../../../packages/amazon-bedrock/src/__fixtures__/amazon-bedrock-empty-message-validation-error.json',
      import.meta.url,
    ),
    'utf8',
  ),
);

async function main() {
  const requestBodies: Array<{
    messages?: Array<{ content?: unknown[] }>;
  }> = [];

  const bedrock = createAmazonBedrock({
    region: 'us-east-1',
    accessKeyId: 'test',
    secretAccessKey: 'test',
    fetch: async (_url, init) => {
      const requestBody = JSON.parse(String(init?.body));
      requestBodies.push(requestBody);

      const hasEmptyMessage = requestBody.messages?.some(
        (message: { content?: unknown[] }) => message.content?.length === 0,
      );

      return hasEmptyMessage
        ? new Response(JSON.stringify(validationError.body), {
            status: validationError.status,
            headers: validationError.headers,
          })
        : Response.json({
            output: {
              message: {
                content: [{ text: 'ok' }],
                role: 'assistant',
              },
            },
            stopReason: 'end_turn',
            usage: {
              inputTokens: 1,
              outputTokens: 1,
              totalTokens: 2,
            },
          });
    },
  });

  async function replay(messages: UIMessage[]) {
    try {
      await generateText({
        model: bedrock('us.amazon.nova-2-lite-v1:0'),
        messages: await convertToModelMessages(messages),
      });
      return undefined;
    } catch (error) {
      if (!APICallError.isInstance(error)) {
        throw error;
      }

      return error;
    }
  }

  const firstFailure = await replay(initialMessages);
  const nextTurnMessages: UIMessage[] = [
    ...initialMessages,
    {
      id: 'u3',
      role: 'user',
      parts: [{ type: 'text', text: 'are you there?' }],
    },
  ];
  const secondFailure = await replay(nextTurnMessages);

  const failures = [firstFailure, secondFailure];
  const everyReplayWasRejected = failures.every(
    error =>
      error?.statusCode === 400 &&
      error.isRetryable === false &&
      error.responseBody === JSON.stringify(validationError.body),
  );
  const everyRequestContainedAnEmptyAssistant = requestBodies.every(body =>
    body.messages?.some(message => message.content?.length === 0),
  );

  if (everyReplayWasRejected && everyRequestContainedAnEmptyAssistant) {
    console.error(
      'ISSUE #18452 REPRODUCED: Bedrock rejects every replay with a non-retryable 400 because unsigned reasoning leaves an empty assistant message.',
    );
    process.exitCode = 1;
    return;
  }

  if (failures.every(error => error == null)) {
    console.log('Issue #18452 did not reproduce.');
    return;
  }

  throw new Error('Unexpected reproduction result.');
}

main();
