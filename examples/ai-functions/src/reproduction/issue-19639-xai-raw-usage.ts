import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createXai } from '@ai-sdk/xai';
import { generateText, streamText, type LanguageModelUsage } from 'ai';

type JsonObject = Record<string, unknown>;

type Fixture = {
  json?: JsonObject;
  chunks?: JsonObject[];
};

const fixtureDirectory = resolve(
  process.cwd(),
  '../../packages/xai/src/__fixtures__',
);

async function readJsonFixture(filename: string): Promise<JsonObject> {
  return JSON.parse(
    await readFile(resolve(fixtureDirectory, filename), 'utf8'),
  ) as JsonObject;
}

async function readChunkFixture(filename: string): Promise<JsonObject[]> {
  return (await readFile(resolve(fixtureDirectory, filename), 'utf8'))
    .split('\n')
    .filter(line => line.length > 0)
    .map(line => JSON.parse(line) as JsonObject);
}

function getUsage(value: JsonObject): JsonObject {
  const usage = value.usage;
  if (usage == null || typeof usage !== 'object' || Array.isArray(usage)) {
    throw new Error('Recorded provider fixture does not contain usage');
  }
  return usage as JsonObject;
}

function assertNormalizedUsage({
  actual,
  expected,
  scenario,
}: {
  actual: LanguageModelUsage;
  expected: {
    inputTokens: number;
    noCacheTokens: number;
    cacheReadTokens: number;
    outputTokens: number;
    textTokens: number;
    reasoningTokens: number;
    totalTokens: number;
  };
  scenario: string;
}) {
  const normalized = {
    inputTokens: actual.inputTokens,
    noCacheTokens: actual.inputTokenDetails.noCacheTokens,
    cacheReadTokens: actual.inputTokenDetails.cacheReadTokens,
    outputTokens: actual.outputTokens,
    textTokens: actual.outputTokenDetails.textTokens,
    reasoningTokens: actual.outputTokenDetails.reasoningTokens,
    totalTokens: actual.totalTokens,
  };

  if (JSON.stringify(normalized) !== JSON.stringify(expected)) {
    throw new Error(
      `Unexpected normalized usage for ${scenario}: ${JSON.stringify(normalized)}`,
    );
  }
}

function collectMissingRawFields({
  actual,
  expected,
  scenario,
}: {
  actual: JsonObject | undefined;
  expected: JsonObject;
  scenario: string;
}): string[] {
  const missing: string[] = [];

  function visit(
    actualValue: unknown,
    expectedValue: unknown,
    path: string,
  ): void {
    if (
      expectedValue != null &&
      typeof expectedValue === 'object' &&
      !Array.isArray(expectedValue)
    ) {
      if (
        actualValue == null ||
        typeof actualValue !== 'object' ||
        Array.isArray(actualValue)
      ) {
        missing.push(`${scenario}:${path}`);
        return;
      }

      for (const [key, nestedExpected] of Object.entries(expectedValue)) {
        visit(
          (actualValue as JsonObject)[key],
          nestedExpected,
          path.length === 0 ? key : `${path}.${key}`,
        );
      }
      return;
    }

    if (!Object.is(actualValue, expectedValue)) {
      missing.push(`${scenario}:${path}`);
    }
  }

  visit(actual, expected, '');
  return missing;
}

async function main() {
  const xaiGenerate = await readJsonFixture('xai-text.json');
  const xaiStream = await readChunkFixture('xai-text.chunks.txt');
  const gatewayGenerate = await readJsonFixture('issue-19639-generate.json');
  const gatewayStream = await readChunkFixture('issue-19639-stream.chunks.txt');

  const fixtures = new Map<string, Fixture>([
    [
      'grok-3:generate',
      {
        json: xaiGenerate,
      },
    ],
    [
      'grok-3:stream',
      {
        chunks: xaiStream,
      },
    ],
    [
      'spacexai/grok-4.1-fast-non-reasoning:generate',
      {
        json: gatewayGenerate,
      },
    ],
    [
      'spacexai/grok-4.1-fast-non-reasoning:stream',
      {
        chunks: gatewayStream,
      },
    ],
  ]);

  const server = createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) {
      body += chunk;
    }

    const requestBody = JSON.parse(body) as {
      model: string;
      stream?: boolean;
    };
    const key = `${requestBody.model}:${requestBody.stream ? 'stream' : 'generate'}`;
    const fixture = fixtures.get(key);

    if (fixture?.json != null) {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(fixture.json));
      return;
    }

    if (fixture?.chunks != null) {
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      for (const chunk of fixture.chunks) {
        response.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }
      response.end('data: [DONE]\n\n');
      return;
    }

    response.writeHead(500, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: `No fixture for ${key}` }));
  });

  await new Promise<void>((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, '127.0.0.1', () => resolveListen());
  });

  try {
    const address = server.address();
    if (address == null || typeof address === 'string') {
      throw new Error('Failed to start fixture server');
    }

    const provider = createXai({
      apiKey: 'test-api-key',
      baseURL: `http://127.0.0.1:${address.port}/v1`,
    });

    const directModel = provider.chat('grok-3');
    const directGenerateResult = await generateText({
      model: directModel,
      prompt: 'Hello',
      maxRetries: 0,
    });
    const directStreamResult = streamText({
      model: directModel,
      prompt: 'Hello',
      maxRetries: 0,
    });
    await directStreamResult.consumeStream();
    const directStreamUsage = (await directStreamResult.finalStep).usage;

    assertNormalizedUsage({
      actual: directGenerateResult.finalStep.usage,
      expected: {
        inputTokens: 12,
        noCacheTokens: 10,
        cacheReadTokens: 2,
        outputTokens: 229,
        textTokens: 1,
        reasoningTokens: 228,
        totalTokens: 241,
      },
      scenario: 'direct xAI generate',
    });
    assertNormalizedUsage({
      actual: directStreamUsage,
      expected: {
        inputTokens: 12,
        noCacheTokens: 1,
        cacheReadTokens: 11,
        outputTokens: 291,
        textTokens: 1,
        reasoningTokens: 290,
        totalTokens: 303,
      },
      scenario: 'direct xAI stream',
    });

    const gatewayModel = provider.chat('spacexai/grok-4.1-fast-non-reasoning');
    const gatewayGenerateResult = await generateText({
      model: gatewayModel,
      prompt: 'Reply with exactly OK',
      maxRetries: 0,
    });
    const gatewayStreamResult = streamText({
      model: gatewayModel,
      prompt: 'Reply with exactly OK',
      maxRetries: 0,
    });
    await gatewayStreamResult.consumeStream();
    const gatewayStreamUsage = (await gatewayStreamResult.finalStep).usage;

    assertNormalizedUsage({
      actual: gatewayGenerateResult.finalStep.usage,
      expected: {
        inputTokens: 675,
        noCacheTokens: 1,
        cacheReadTokens: 674,
        outputTokens: 1,
        textTokens: 1,
        reasoningTokens: 0,
        totalTokens: 676,
      },
      scenario: 'configured endpoint generate',
    });
    assertNormalizedUsage({
      actual: gatewayStreamUsage,
      expected: {
        inputTokens: 675,
        noCacheTokens: 1,
        cacheReadTokens: 674,
        outputTokens: 1,
        textTokens: 1,
        reasoningTokens: 0,
        totalTokens: 676,
      },
      scenario: 'configured endpoint stream',
    });

    const directStreamProviderUsage = getUsage(xaiStream[xaiStream.length - 1]);
    const gatewayStreamProviderUsage = getUsage(
      gatewayStream[gatewayStream.length - 1],
    );
    const missingFields = [
      ...collectMissingRawFields({
        actual: directGenerateResult.finalStep.usage.raw,
        expected: getUsage(xaiGenerate),
        scenario: 'direct-generate',
      }),
      ...collectMissingRawFields({
        actual: directStreamUsage.raw,
        expected: directStreamProviderUsage,
        scenario: 'direct-stream',
      }),
      ...collectMissingRawFields({
        actual: gatewayGenerateResult.finalStep.usage.raw,
        expected: getUsage(gatewayGenerate),
        scenario: 'configured-generate',
      }),
      ...collectMissingRawFields({
        actual: gatewayStreamUsage.raw,
        expected: gatewayStreamProviderUsage,
        scenario: 'configured-stream',
      }),
    ];

    if (missingFields.length > 0) {
      throw new Error(
        `Issue #19639 reproduced: xAI Chat Completions usage.raw dropped provider usage fields (${missingFields.join(', ')})`,
      );
    }

    console.log(
      'Issue #19639 not reproduced: generate and stream preserved complete raw usage objects.',
    );
  } finally {
    await new Promise<void>(resolveClose => {
      server.close(() => resolveClose());
    });
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
