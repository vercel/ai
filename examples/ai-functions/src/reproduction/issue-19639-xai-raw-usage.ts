import { createXai } from '@ai-sdk/xai';
import { generateText, streamText } from 'ai';
import { isDeepStrictEqual } from 'node:util';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const fixtureDirectory = resolve(
  process.cwd(),
  '../../packages/xai/src/__fixtures__',
);

async function readJsonFixture(filename: string) {
  return JSON.parse(
    await readFile(resolve(fixtureDirectory, filename), 'utf8'),
  ) as Record<string, unknown>;
}

async function readStreamFixture(filename: string) {
  return (await readFile(resolve(fixtureDirectory, filename), 'utf8'))
    .split('\n')
    .filter(line => line.length > 0);
}

function createJsonFetch(response: Record<string, unknown>): typeof fetch {
  return async () =>
    new Response(JSON.stringify(response), {
      headers: { 'content-type': 'application/json' },
    });
}

function createStreamFetch(chunks: string[]): typeof fetch {
  return async () =>
    new Response(
      `${chunks.map(chunk => `data: ${chunk}\n\n`).join('')}data: [DONE]\n\n`,
      { headers: { 'content-type': 'text/event-stream' } },
    );
}

async function main() {
  const directGenerateResponse = await readJsonFixture('xai-text.json');
  const compatibleGenerateResponse = await readJsonFixture(
    'issue-19639-generate.json',
  );
  const directStreamChunks = await readStreamFixture('xai-text.chunks.txt');
  const compatibleStreamChunks = await readStreamFixture(
    'issue-19639-stream.chunks.txt',
  );

  const directGenerate = await generateText({
    model: createXai({
      apiKey: 'test',
      fetch: createJsonFetch(directGenerateResponse),
    })('grok-3-mini'),
    prompt: 'Say one word.',
  });
  const compatibleGenerate = await generateText({
    model: createXai({
      apiKey: 'test',
      fetch: createJsonFetch(compatibleGenerateResponse),
    })('spacexai/grok-4.1-fast-non-reasoning'),
    prompt: 'Say one word.',
  });

  const directStream = streamText({
    model: createXai({
      apiKey: 'test',
      fetch: createStreamFetch(directStreamChunks),
    })('grok-3-mini'),
    prompt: 'Say one word.',
  });
  await directStream.consumeStream();

  const compatibleStream = streamText({
    model: createXai({
      apiKey: 'test',
      fetch: createStreamFetch(compatibleStreamChunks),
    })('spacexai/grok-4.1-fast-non-reasoning'),
    prompt: 'Say one word.',
  });
  await compatibleStream.consumeStream();

  const directStreamUsage = await directStream.usage;
  const compatibleStreamUsage = await compatibleStream.usage;
  const directStreamRawUsage = (
    JSON.parse(directStreamChunks.at(-1)!) as {
      usage: Record<string, unknown>;
    }
  ).usage;
  const compatibleStreamRawUsage = (
    JSON.parse(compatibleStreamChunks.at(-1)!) as {
      usage: Record<string, unknown>;
    }
  ).usage;

  const normalizedUsageMatches =
    directGenerate.usage.inputTokens === 12 &&
    directGenerate.usage.inputTokenDetails.cacheReadTokens === 2 &&
    directGenerate.usage.outputTokens === 229 &&
    directGenerate.usage.outputTokenDetails.reasoningTokens === 228 &&
    compatibleGenerate.usage.inputTokens === 675 &&
    compatibleGenerate.usage.inputTokenDetails.cacheReadTokens === 674 &&
    compatibleGenerate.usage.outputTokens === 1 &&
    compatibleGenerate.usage.outputTokenDetails.reasoningTokens === 0 &&
    directStreamUsage.inputTokens === 12 &&
    directStreamUsage.inputTokenDetails.cacheReadTokens === 11 &&
    directStreamUsage.outputTokens === 291 &&
    directStreamUsage.outputTokenDetails.reasoningTokens === 290 &&
    compatibleStreamUsage.inputTokens === 675 &&
    compatibleStreamUsage.inputTokenDetails.cacheReadTokens === 674 &&
    compatibleStreamUsage.outputTokens === 1 &&
    compatibleStreamUsage.outputTokenDetails.reasoningTokens === 0;

  if (!normalizedUsageMatches) {
    throw new Error('Normalized xAI token usage changed unexpectedly');
  }

  const rawUsageMatches = [
    isDeepStrictEqual(
      directGenerate.usage.raw,
      (directGenerateResponse as { usage: Record<string, unknown> }).usage,
    ),
    isDeepStrictEqual(
      compatibleGenerate.usage.raw,
      (compatibleGenerateResponse as { usage: Record<string, unknown> }).usage,
    ),
    isDeepStrictEqual(directStreamUsage.raw, directStreamRawUsage),
    isDeepStrictEqual(compatibleStreamUsage.raw, compatibleStreamRawUsage),
  ];

  if (rawUsageMatches.some(matches => !matches)) {
    console.error(
      'ISSUE_19639_REPRODUCED: xAI Chat Completions usage.raw dropped provider fields',
    );
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 2;
});
