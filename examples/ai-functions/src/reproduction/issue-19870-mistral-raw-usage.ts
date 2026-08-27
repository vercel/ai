import { createMistral } from '@ai-sdk/mistral';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { generateText, streamText } from 'ai';

type Usage = Record<string, unknown>;

const fixtureDirectory = new URL(
  '../../../../packages/mistral/src/__fixtures__/',
  import.meta.url,
);

const normalResponse = JSON.parse(
  fs.readFileSync(
    new URL('mistral-usage-raw-live.json', fixtureDirectory),
    'utf8',
  ),
) as {
  usage: Usage;
};

const streamEvents = fs
  .readFileSync(
    new URL('mistral-usage-raw-live.chunks.txt', fixtureDirectory),
    'utf8',
  )
  .trim()
  .split('\n')
  .map(line => JSON.parse(line) as { usage?: Usage });

const finalStreamUsage = streamEvents
  .map(event => event.usage)
  .filter((usage): usage is Usage => usage != null)
  .at(-1);

function createFixtureFetch() {
  return async (_input: RequestInfo | URL, init?: RequestInit) => {
    const requestBody =
      typeof init?.body === 'string'
        ? (JSON.parse(init.body) as { stream?: boolean })
        : {};

    if (requestBody.stream) {
      const body = `${streamEvents
        .map(event => `data: ${JSON.stringify(event)}\n\n`)
        .join('')}data: [DONE]\n\n`;

      return new Response(body, {
        headers: { 'content-type': 'text/event-stream' },
      });
    }

    return Response.json(normalResponse);
  };
}

function normalizedUsage(usage: {
  inputTokens: number | undefined;
  inputTokenDetails: {
    noCacheTokens: number | undefined;
    cacheReadTokens: number | undefined;
    cacheWriteTokens: number | undefined;
  };
  outputTokens: number | undefined;
  outputTokenDetails: {
    textTokens: number | undefined;
    reasoningTokens: number | undefined;
  };
  totalTokens: number | undefined;
}) {
  return {
    inputTokens: usage.inputTokens,
    inputTokenDetails: usage.inputTokenDetails,
    outputTokens: usage.outputTokens,
    outputTokenDetails: usage.outputTokenDetails,
    totalTokens: usage.totalTokens,
  };
}

async function main() {
  assert.ok(finalStreamUsage, 'The recorded stream must contain usage.');

  const mistral = createMistral({
    apiKey: 'fixture-api-key',
    fetch: createFixtureFetch(),
  });
  const model = mistral('mistral-small-latest');

  const normalResult = await generateText({
    model,
    prompt: 'Reply with exactly: OK',
    maxRetries: 0,
  });

  const streamResult = streamText({
    model,
    prompt: 'Reply with exactly: OK',
    maxRetries: 0,
  });
  await streamResult.consumeStream();
  const streamingFinalStep = await streamResult.finalStep;

  assert.deepStrictEqual(normalizedUsage(normalResult.finalStep.usage), {
    inputTokens: 20,
    inputTokenDetails: {
      noCacheTokens: 20,
      cacheReadTokens: undefined,
      cacheWriteTokens: undefined,
    },
    outputTokens: 2,
    outputTokenDetails: {
      textTokens: 2,
      reasoningTokens: undefined,
    },
    totalTokens: 22,
  });
  assert.deepStrictEqual(
    normalizedUsage(streamingFinalStep.usage),
    normalizedUsage(normalResult.finalStep.usage),
  );

  const normalRawMatches = isDeepStrictEqual(
    normalResult.finalStep.usage.raw,
    normalResponse.usage,
  );
  const streamingRawMatches = isDeepStrictEqual(
    streamingFinalStep.usage.raw,
    finalStreamUsage,
  );

  console.log(
    JSON.stringify(
      {
        normal: {
          providerBoundary: normalResponse.usage,
          finalStepRaw: normalResult.finalStep.usage.raw,
          rawMatches: normalRawMatches,
        },
        streaming: {
          finalProviderBoundary: finalStreamUsage,
          finalStepRaw: streamingFinalStep.usage.raw,
          rawMatches: streamingRawMatches,
        },
      },
      null,
      2,
    ),
  );

  if (!normalRawMatches || !streamingRawMatches) {
    throw new Error(
      'Reproduced issue #19870: Mistral finalStep.usage.raw dropped provider usage fields.',
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
