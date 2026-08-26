import { createXai } from '@ai-sdk/xai';
import { generateText, streamText, type LanguageModelUsage } from 'ai';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isDeepStrictEqual } from 'node:util';

const jsonFixtureUrl = new URL(
  '../../../../packages/xai/src/responses/__fixtures__/xai-image-generation-tool.1.json',
  import.meta.url,
);
const chunksFixtureUrl = new URL(
  '../../../../packages/xai/src/responses/__fixtures__/xai-image-generation-tool.1.chunks.txt',
  import.meta.url,
);

function addUnknownUsageFields(usage: {
  input_tokens_details: Record<string, unknown>;
  output_tokens_details: Record<string, unknown>;
  [key: string]: unknown;
}) {
  usage.input_tokens_details.provider_input_sentinel = { preserved: true };
  usage.output_tokens_details.provider_output_sentinel = ['preserve', 1];
  usage.provider_top_level_sentinel = { preserved: true };
}

const jsonFixture = JSON.parse(fs.readFileSync(jsonFixtureUrl, 'utf8'));
addUnknownUsageFields(jsonFixture.usage);
const chunkLines = fs
  .readFileSync(chunksFixtureUrl, 'utf8')
  .trim()
  .split('\n')
  .map(line => {
    const event = JSON.parse(line);
    if (event.response?.usage != null) {
      addUnknownUsageFields(event.response.usage);
    }
    return JSON.stringify(event);
  });
const expectedRawUsage = jsonFixture.usage;

function createFixtureFetch() {
  return async (_input: RequestInfo | URL, init?: RequestInit) => {
    const requestBody = JSON.parse(String(init?.body));

    if (requestBody.stream) {
      return new Response(
        `${chunkLines.map(line => `data: ${line}\n\n`).join('')}data: [DONE]\n\n`,
        { headers: { 'Content-Type': 'text/event-stream' } },
      );
    }

    return Response.json(jsonFixture);
  };
}

function assertNormalizedUsage(usage: LanguageModelUsage) {
  assert.equal(usage.inputTokens, 100);
  assert.deepStrictEqual(usage.inputTokenDetails, {
    noCacheTokens: 80,
    cacheReadTokens: 20,
    cacheWriteTokens: undefined,
  });
  assert.equal(usage.outputTokens, 50);
  assert.deepStrictEqual(usage.outputTokenDetails, {
    textTokens: 20,
    reasoningTokens: 30,
  });
  assert.equal(usage.totalTokens, 150);
}

async function assertKnownFieldsStillValidate() {
  const invalidFixture = structuredClone(jsonFixture);
  invalidFixture.usage.input_tokens = '100';

  const invalidXai = createXai({
    apiKey: 'test-key',
    fetch: async () => Response.json(invalidFixture),
  });

  let rejected = false;
  try {
    await generateText({
      model: invalidXai.responses('grok-4-fast-non-reasoning'),
      prompt: 'hello',
    });
  } catch {
    rejected = true;
  }

  assert.equal(rejected, true, 'known input_tokens type validation was lost');
}

async function main() {
  const xai = createXai({
    apiKey: 'test-key',
    fetch: createFixtureFetch(),
  });

  const generated = await generateText({
    model: xai.responses('grok-4-fast-non-reasoning'),
    prompt: 'hello',
  });
  assertNormalizedUsage(generated.finalStep.usage);

  const streamed = streamText({
    model: xai.responses('grok-4-fast-non-reasoning'),
    prompt: 'hello',
  });
  await streamed.consumeStream();
  const streamFinalStep = (await streamed.steps).at(-1);
  assert.ok(streamFinalStep != null);
  assertNormalizedUsage(streamFinalStep.usage);

  await assertKnownFieldsStillValidate();

  const generatePreserved = isDeepStrictEqual(
    generated.finalStep.usage.raw,
    expectedRawUsage,
  );
  const streamPreserved = isDeepStrictEqual(
    streamFinalStep.usage.raw,
    expectedRawUsage,
  );

  if (!generatePreserved || !streamPreserved) {
    throw new Error(
      'ISSUE_19652_REPRODUCED: xAI Responses usage.raw dropped provider fields',
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
