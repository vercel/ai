import { createMistral } from '@ai-sdk/mistral';
import { generateText, streamText } from 'ai';
import { deepStrictEqual } from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';

const fixtureDirectory = new URL(
  '../../../../packages/mistral/src/__fixtures__/',
  import.meta.url,
);

async function readFixtures() {
  const normalResponse = JSON.parse(
    await readFile(
      new URL('mistral-usage-raw-live.json', fixtureDirectory),
      'utf8',
    ),
  );
  const streamResponse = await readFile(
    new URL('mistral-usage-raw-live.chunks.txt', fixtureDirectory),
    'utf8',
  );

  return { normalResponse, streamResponse };
}

async function main() {
  const { normalResponse, streamResponse } = await readFixtures();

  const mistral = createMistral({
    apiKey: 'fixture-api-key',
    fetch: async (_url, init) => {
      const request = JSON.parse(init!.body as string);

      return request.stream
        ? new Response(
            streamResponse
              .trim()
              .split('\n')
              .map(line => `data: ${line}\n\n`)
              .join('') + 'data: [DONE]\n\n',
            { headers: { 'content-type': 'text/event-stream' } },
          )
        : Response.json(normalResponse);
    },
  });

  const normalResult = await generateText({
    model: mistral('mistral-small-latest'),
    prompt: 'Reply with OK.',
  });

  const streamResult = streamText({
    model: mistral('mistral-small-latest'),
    prompt: 'Reply with OK.',
  });
  await streamResult.consumeStream();
  const normalFinalStep = normalResult.steps.at(-1)!;
  const streamingFinalStep = (await streamResult.steps).at(-1)!;

  const expectedNormalized = {
    inputTokens: 19,
    inputTokenDetails: {
      noCacheTokens: 19,
      cacheReadTokens: undefined,
      cacheWriteTokens: undefined,
    },
    outputTokens: 2,
    outputTokenDetails: {
      textTokens: 2,
      reasoningTokens: undefined,
    },
    totalTokens: 21,
  };

  deepStrictEqual(
    {
      inputTokens: normalFinalStep.usage.inputTokens,
      inputTokenDetails: normalFinalStep.usage.inputTokenDetails,
      outputTokens: normalFinalStep.usage.outputTokens,
      outputTokenDetails: normalFinalStep.usage.outputTokenDetails,
      totalTokens: normalFinalStep.usage.totalTokens,
    },
    expectedNormalized,
  );
  deepStrictEqual(
    {
      inputTokens: streamingFinalStep.usage.inputTokens,
      inputTokenDetails: streamingFinalStep.usage.inputTokenDetails,
      outputTokens: streamingFinalStep.usage.outputTokens,
      outputTokenDetails: streamingFinalStep.usage.outputTokenDetails,
      totalTokens: streamingFinalStep.usage.totalTokens,
    },
    expectedNormalized,
  );

  const streamingBoundaryUsage = JSON.parse(
    streamResponse.trim().split('\n').at(-1)!,
  ).usage;
  const normalRawMatches = isDeepStrictEqual(
    normalFinalStep.usage.raw,
    normalResponse.usage,
  );
  const streamingRawMatches = isDeepStrictEqual(
    streamingFinalStep.usage.raw,
    streamingBoundaryUsage,
  );

  if (!normalRawMatches || !streamingRawMatches) {
    console.error(
      JSON.stringify(
        {
          normal: {
            providerBoundary: normalResponse.usage,
            finalStepRaw: normalFinalStep.usage.raw,
            deepEqual: normalRawMatches,
          },
          streaming: {
            providerBoundary: streamingBoundaryUsage,
            finalStepRaw: streamingFinalStep.usage.raw,
            deepEqual: streamingRawMatches,
          },
        },
        null,
        2,
      ),
    );
    throw new Error(
      'ISSUE_19870: Mistral usage.raw does not preserve complete provider usage objects',
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
