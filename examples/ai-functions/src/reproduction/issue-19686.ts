import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import fs from 'node:fs';
import { isDeepStrictEqual } from 'node:util';

const fixture = JSON.parse(
  fs.readFileSync(
    new URL(
      '../../../../packages/amazon-bedrock/src/__fixtures__/issue-19686-usage-raw.json',
      import.meta.url,
    ),
    'utf8',
  ),
);
const expectedUsage = fixture.deterministicUsage;
const eventStream = Buffer.from(
  fixture.deterministicEventStreamBase64,
  'base64',
);

async function main() {
  const bedrock = createAmazonBedrock({
    apiKey: 'test-key',
    region: 'us-east-1',
    baseURL: 'https://bedrock-runtime.us-east-1.amazonaws.com',
    fetch: async input => {
      if (String(input).endsWith('/converse-stream')) {
        return new Response(eventStream, {
          status: 200,
          headers: {
            'content-type': 'application/vnd.amazon.eventstream',
          },
        });
      }

      return new Response(
        JSON.stringify({
          output: {
            message: {
              role: 'assistant',
              content: [{ text: 'Hello!' }],
            },
          },
          stopReason: 'end_turn',
          usage: expectedUsage,
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      );
    },
  });
  const model = bedrock('anthropic.claude-3-haiku-20240307-v1:0');
  const prompt = [
    {
      role: 'user' as const,
      content: [{ type: 'text' as const, text: 'Hello' }],
    },
  ];

  const generated = await model.doGenerate({ prompt });
  const { stream } = await model.doStream({
    prompt,
    includeRawChunks: false,
  });
  const streamParts = [];
  const reader = stream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    streamParts.push(value);
  }
  const streamFinish = streamParts.find(part => part.type === 'finish');

  const observed = {
    expectedProviderUsage: expectedUsage,
    converseRaw: generated.usage.raw,
    converseStreamRaw: streamFinish?.usage.raw,
    normalized: {
      converse: {
        inputTokens: generated.usage.inputTokens,
        outputTokens: generated.usage.outputTokens,
      },
      converseStream: {
        inputTokens: streamFinish?.usage.inputTokens,
        outputTokens: streamFinish?.usage.outputTokens,
      },
    },
  };
  console.log(JSON.stringify(observed, null, 2));

  const rawUsageWasLost =
    !isDeepStrictEqual(generated.usage.raw, expectedUsage) ||
    !isDeepStrictEqual(streamFinish?.usage.raw, expectedUsage);

  if (rawUsageWasLost) {
    throw new Error(
      'Reproduced issue #19686: Amazon Bedrock usage.raw did not preserve the complete provider usage object.',
    );
  }

  const expectedInputTokens = {
    total: 54,
    noCache: 47,
    cacheRead: 3,
    cacheWrite: 4,
  };
  const expectedOutputTokens = {
    total: 20,
    text: 20,
    reasoning: undefined,
  };
  if (
    !isDeepStrictEqual(generated.usage.inputTokens, expectedInputTokens) ||
    !isDeepStrictEqual(generated.usage.outputTokens, expectedOutputTokens) ||
    !isDeepStrictEqual(streamFinish?.usage.inputTokens, expectedInputTokens) ||
    !isDeepStrictEqual(streamFinish?.usage.outputTokens, expectedOutputTokens)
  ) {
    throw new Error('Expected normalized token counts to remain unchanged.');
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
