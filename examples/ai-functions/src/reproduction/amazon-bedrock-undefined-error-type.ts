import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { readFileSync } from 'node:fs';

const providerMessage =
  "This model doesn't support the image field for user messages. Remove image and try again.";
const responseBody = readFileSync(
  new URL(
    '../../../../packages/amazon-bedrock/src/__fixtures__/amazon-bedrock-validation-error-no-type.json',
    import.meta.url,
  ),
  'utf8',
);

const png1x1 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

const bedrock = createAmazonBedrock({
  apiKey: 'test-api-key',
  region: 'us-east-1',
  fetch: async () =>
    new Response(responseBody, {
      status: 400,
      headers: {
        'content-type': 'application/json',
        'x-amzn-errortype':
          'ValidationException:http://internal.amazon.com/coral/com.amazon.bedrock/',
      },
    }),
});

const chatPrompt = [
  {
    role: 'user' as const,
    content: [
      { type: 'text' as const, text: 'Use the image-generator result.' },
    ],
  },
  {
    role: 'assistant' as const,
    content: [
      {
        type: 'tool-call' as const,
        toolCallId: 'call-1',
        toolName: 'image-generator',
        input: {},
      },
    ],
  },
  {
    role: 'tool' as const,
    content: [
      {
        type: 'tool-result' as const,
        toolCallId: 'call-1',
        toolName: 'image-generator',
        output: {
          type: 'content' as const,
          value: [
            {
              type: 'image-data' as const,
              data: png1x1,
              mediaType: 'image/png',
            },
          ],
        },
      },
    ],
  },
];

async function captureErrorMessage(
  label: string,
  call: () => PromiseLike<unknown>,
): Promise<string> {
  try {
    await call();
  } catch (error) {
    if (error instanceof Error) {
      return error.message;
    }
    throw new Error(`${label} rejected with a non-Error value`);
  }

  throw new Error(`${label} unexpectedly succeeded`);
}

async function main() {
  const messages = {
    'non-streaming chat': await captureErrorMessage('non-streaming chat', () =>
      bedrock('global.openai.gpt-6-astra').doGenerate({
        prompt: chatPrompt,
      }),
    ),
    'streaming chat': await captureErrorMessage('streaming chat', () =>
      bedrock('global.openai.gpt-6-astra').doStream({
        prompt: chatPrompt,
      }),
    ),
    embedding: await captureErrorMessage('embedding', () =>
      bedrock.embedding('amazon.titan-embed-text-v2:0').doEmbed({
        values: ['sunny day at the beach'],
      }),
    ),
    image: await captureErrorMessage('image', () =>
      bedrock.image('amazon.nova-canvas-v1:0').doGenerate({
        prompt: 'A sunny day at the beach',
        n: 1,
        size: undefined,
        aspectRatio: undefined,
        seed: undefined,
        files: undefined,
        mask: undefined,
        providerOptions: {},
      }),
    ),
    reranking: await captureErrorMessage('reranking', () =>
      bedrock.reranking('cohere.rerank-v3-5:0').doRerank({
        documents: {
          type: 'text',
          values: ['sunny day at the beach'],
        },
        query: 'sunny beach',
        topN: 1,
      }),
    ),
  };

  for (const [label, message] of Object.entries(messages)) {
    if (!message.includes(providerMessage)) {
      throw new Error(
        `${label} did not preserve the Bedrock provider message: ${message}`,
      );
    }
  }

  if (messages['non-streaming chat'].startsWith('undefined:')) {
    throw new Error(
      `Unexpected comparison result: non-streaming chat returned ${messages['non-streaming chat']}`,
    );
  }

  const affectedHandlers = [
    'streaming chat',
    'embedding',
    'image',
    'reranking',
  ] as const;
  const handlersWithUndefinedPrefix = affectedHandlers.filter(label =>
    messages[label].startsWith('undefined:'),
  );

  if (handlersWithUndefinedPrefix.length > 0) {
    console.error(JSON.stringify(messages, null, 2));
    throw new Error(
      'ISSUE #20926 REPRODUCED: Bedrock API errors without a body type are exposed to users with an "undefined:" prefix.',
    );
  }

  console.log(
    'PASS: Bedrock API errors preserve the provider message without an "undefined:" prefix.',
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
