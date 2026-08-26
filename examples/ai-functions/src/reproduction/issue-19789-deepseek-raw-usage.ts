import { createDeepSeek } from '@ai-sdk/deepseek';
import { generateText, streamText } from 'ai';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

type Usage = Record<string, unknown>;

function readUsage(value: unknown): Usage | undefined {
  if (
    value != null &&
    typeof value === 'object' &&
    'usage' in value &&
    value.usage != null &&
    typeof value.usage === 'object'
  ) {
    return value.usage as Usage;
  }
}

const jsonFixtureUrl = new URL(
  '../../../../packages/deepseek/src/chat/__fixtures__/issue-19789-live-usage.json',
  import.meta.url,
);
const chunksFixtureUrl = new URL(
  '../../../../packages/deepseek/src/chat/__fixtures__/issue-19789-live-usage.chunks.txt',
  import.meta.url,
);

async function fixtureFetch(
  input: string | URL | Request,
  init?: RequestInit,
): Promise<Response> {
  void input;
  const requestBody =
    typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;

  if (requestBody?.stream === true) {
    const chunks = (await fs.readFile(chunksFixtureUrl, 'utf8'))
      .trim()
      .split('\n')
      .map(line => `data: ${line}\n\n`)
      .join('');

    return new Response(`${chunks}data: [DONE]\n\n`, {
      headers: { 'content-type': 'text/event-stream' },
    });
  }

  return new Response(await fs.readFile(jsonFixtureUrl, 'utf8'), {
    headers: { 'content-type': 'application/json' },
  });
}

async function main() {
  const jsonFixture = JSON.parse(await fs.readFile(jsonFixtureUrl, 'utf8'));
  const streamFixtureLines = (await fs.readFile(chunksFixtureUrl, 'utf8'))
    .trim()
    .split('\n');
  const jsonProviderUsage = readUsage(jsonFixture);
  const streamProviderUsage = readUsage(JSON.parse(streamFixtureLines.at(-1)!));

  assert.ok(jsonProviderUsage);
  assert.ok(streamProviderUsage);

  const deepseek = createDeepSeek({
    apiKey: 'test-api-key',
    fetch: fixtureFetch,
  });

  const generated = await generateText({
    model: deepseek('deepseek-v4-flash'),
    prompt: 'Reply with only OK.',
    maxOutputTokens: 4,
  });

  const streamed = streamText({
    model: deepseek('deepseek-v4-flash'),
    prompt: 'Reply with only OK.',
    maxOutputTokens: 4,
  });
  await streamed.consumeStream();
  const streamUsage = await streamed.usage;

  assert.deepStrictEqual(
    {
      inputTokens: generated.usage.inputTokens,
      outputTokens: generated.usage.outputTokens,
      totalTokens: generated.usage.totalTokens,
      reasoningTokens: generated.usage.outputTokenDetails.reasoningTokens,
      cacheReadTokens: generated.usage.inputTokenDetails.cacheReadTokens,
    },
    {
      inputTokens: 88,
      outputTokens: 4,
      totalTokens: 92,
      reasoningTokens: 4,
      cacheReadTokens: 0,
    },
  );
  assert.deepStrictEqual(
    {
      inputTokens: streamUsage.inputTokens,
      outputTokens: streamUsage.outputTokens,
      totalTokens: streamUsage.totalTokens,
      reasoningTokens: streamUsage.outputTokenDetails.reasoningTokens,
      cacheReadTokens: streamUsage.inputTokenDetails.cacheReadTokens,
    },
    {
      inputTokens: 88,
      outputTokens: 4,
      totalTokens: 92,
      reasoningTokens: 4,
      cacheReadTokens: 0,
    },
  );

  console.log(
    JSON.stringify(
      {
        json: {
          provider: jsonProviderUsage,
          sdkRaw: generated.usage.raw,
        },
        stream: {
          provider: streamProviderUsage,
          sdkRaw: streamUsage.raw,
        },
      },
      null,
      2,
    ),
  );

  let jsonRawPreserved = true;
  let streamRawPreserved = true;

  try {
    assert.deepStrictEqual(generated.usage.raw, jsonProviderUsage);
  } catch {
    jsonRawPreserved = false;
  }

  try {
    assert.deepStrictEqual(streamUsage.raw, streamProviderUsage);
  } catch {
    streamRawPreserved = false;
  }

  if (!jsonRawPreserved || !streamRawPreserved) {
    throw new Error(
      'ISSUE 19789 REPRODUCED: DeepSeek final usage.raw dropped provider usage fields',
    );
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
