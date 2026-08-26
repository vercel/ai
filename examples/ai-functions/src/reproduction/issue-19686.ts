import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import type {
  LanguageModelV4Prompt,
  LanguageModelV4StreamPart,
  LanguageModelV4Usage,
} from '@ai-sdk/provider';

type Fixture = {
  trace: {
    converseUsage: Record<string, unknown>;
    converseStreamMetadataUsage: Record<string, unknown>;
  };
  cacheUsage: Record<string, unknown>;
  futureTopLevelMetadata: unknown;
};

const require = createRequire(
  new URL('../../../../packages/amazon-bedrock/package.json', import.meta.url),
);
const { EventStreamCodec } = require('@smithy/eventstream-codec');
const { fromUtf8, toUtf8 } = require('@smithy/util-utf8');
const codec = new EventStreamCodec(toUtf8, fromUtf8);
const fixtureUrl = new URL(
  '../../../../packages/amazon-bedrock/src/__fixtures__/issue-19686-usage-raw.json',
  import.meta.url,
);
const prompt: LanguageModelV4Prompt = [
  {
    role: 'user',
    content: [{ type: 'text', text: 'Test' }],
  },
];

function createEventFrame(eventType: string, body: unknown): Uint8Array {
  return codec.encode({
    headers: {
      ':message-type': { type: 'string', value: 'event' },
      ':event-type': { type: 'string', value: eventType },
      ':content-type': { type: 'string', value: 'application/json' },
    },
    body: fromUtf8(JSON.stringify(body)),
  });
}

function createModel({
  generateUsage,
  streamUsage,
}: {
  generateUsage: Record<string, unknown>;
  streamUsage: Record<string, unknown>;
}) {
  return createAmazonBedrock({
    apiKey: 'reproduction-key',
    region: 'us-east-1',
    baseURL: 'https://bedrock.example.test',
    fetch: async input => {
      const url = input.toString();

      if (url.endsWith('/converse')) {
        return new Response(
          JSON.stringify({
            output: {
              message: {
                role: 'assistant',
                content: [],
              },
            },
            stopReason: 'end_turn',
            usage: generateUsage,
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        );
      }

      const frames = [
        createEventFrame('messageStop', { stopReason: 'end_turn' }),
        createEventFrame('metadata', {
          metrics: { latencyMs: 1 },
          usage: streamUsage,
        }),
      ];

      return new Response(
        new ReadableStream({
          start(controller) {
            for (const frame of frames) {
              controller.enqueue(frame);
            }
            controller.close();
          },
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/vnd.amazon.eventstream',
          },
        },
      );
    },
  })('anthropic.claude-3-haiku-20240307-v1:0');
}

async function getStreamFinishUsage(
  stream: ReadableStream<LanguageModelV4StreamPart>,
): Promise<LanguageModelV4Usage> {
  const reader = stream.getReader();

  while (true) {
    const { done, value: part } = await reader.read();
    if (done) {
      break;
    }
    if (part.type === 'finish') {
      return part.usage;
    }
  }

  throw new Error('Expected a finish stream part.');
}

async function main() {
  const fixture = JSON.parse(await readFile(fixtureUrl, 'utf8')) as Fixture;
  const generateUsage: Record<string, unknown> = {
    ...fixture.trace.converseUsage,
    ...fixture.cacheUsage,
    futureTopLevelMetadata: fixture.futureTopLevelMetadata,
  };
  const streamUsage: Record<string, unknown> = {
    ...fixture.trace.converseStreamMetadataUsage,
    ...fixture.cacheUsage,
    futureTopLevelMetadata: fixture.futureTopLevelMetadata,
  };
  const model = createModel({ generateUsage, streamUsage });

  const generateResult = await model.doGenerate({ prompt });
  const streamResult = await model.doStream({
    prompt,
    includeRawChunks: false,
  });
  const streamFinishUsage = await getStreamFinishUsage(streamResult.stream);

  const lostRawUsage = [];
  try {
    assert.deepStrictEqual(generateResult.usage.raw, generateUsage);
  } catch {
    lostRawUsage.push('Converse');
  }
  try {
    assert.deepStrictEqual(streamFinishUsage.raw, streamUsage);
  } catch {
    lostRawUsage.push('ConverseStream');
  }

  if (lostRawUsage.length > 0) {
    console.error(
      `Observed incomplete usage.raw for: ${lostRawUsage.join(', ')}`,
    );
    console.error(
      `Provider stream totalTokens: ${String(streamUsage.totalTokens)}; SDK stream usage.raw: ${JSON.stringify(streamFinishUsage.raw)}`,
    );
    throw new Error(
      'ISSUE_19686_REPRODUCED: Amazon Bedrock usage.raw drops provider usage fields',
    );
  }

  assert.deepStrictEqual(generateResult.usage.inputTokens, {
    total: 18,
    noCache: 13,
    cacheRead: 3,
    cacheWrite: 2,
  });
  assert.deepStrictEqual(generateResult.usage.outputTokens, {
    total: 4,
    text: 4,
    reasoning: undefined,
  });
  assert.deepStrictEqual(streamFinishUsage.inputTokens, {
    total: 18,
    noCache: 13,
    cacheRead: 3,
    cacheWrite: 2,
  });
  assert.deepStrictEqual(streamFinishUsage.outputTokens, {
    total: 5,
    text: 5,
    reasoning: undefined,
  });

  const invalidTotalTokensModel = createModel({
    generateUsage,
    streamUsage: { ...streamUsage, totalTokens: '18' },
  });
  const invalidStream = await invalidTotalTokensModel.doStream({
    prompt,
    includeRawChunks: false,
  });
  const invalidParts = [];
  const invalidReader = invalidStream.stream.getReader();
  while (true) {
    const { done, value } = await invalidReader.read();
    if (done) {
      break;
    }
    invalidParts.push(value);
  }
  assert.ok(
    invalidParts.some(part => part.type === 'error'),
    'Streaming totalTokens must retain numeric validation.',
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
