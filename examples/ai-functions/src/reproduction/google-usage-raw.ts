import { createGoogle } from '@ai-sdk/google';
import { generateText, streamText } from 'ai';
import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';

type UsageMetadata = Record<string, unknown>;

const normalResponse = JSON.parse(
  readFileSync(
    new URL(
      '../../../../packages/google/src/__fixtures__/google-usage-raw-live.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as { usageMetadata: UsageMetadata };

const streamResponse = readFileSync(
  new URL(
    '../../../../packages/google/src/__fixtures__/google-usage-raw-live.chunks.txt',
    import.meta.url,
  ),
  'utf8',
);

const streamBoundary = JSON.parse(
  streamResponse.trim().slice('data: '.length),
) as { usageMetadata: UsageMetadata };

const fixtureFetch: typeof fetch = async input => {
  const url =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;

  if (url.includes(':streamGenerateContent')) {
    return new Response(streamResponse, {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    });
  }

  return Response.json(normalResponse, { status: 200 });
};

const google = createGoogle({
  apiKey: 'test-api-key',
  fetch: fixtureFetch,
});

function assertNormalizedUsage(
  path: string,
  raw: UsageMetadata,
  normalized: {
    inputTokens: number | undefined;
    outputTokens: number | undefined;
    totalTokens: number | undefined;
  },
) {
  const inputTokens = (raw.promptTokenCount as number | undefined) ?? 0;
  const textTokens = (raw.candidatesTokenCount as number | undefined) ?? 0;
  const reasoningTokens = (raw.thoughtsTokenCount as number | undefined) ?? 0;
  const outputTokens = textTokens + reasoningTokens;

  if (
    normalized.inputTokens !== inputTokens ||
    normalized.outputTokens !== outputTokens ||
    normalized.totalTokens !== inputTokens + outputTokens
  ) {
    throw new Error(`Unexpected normalized usage calculation on ${path} path`);
  }
}

async function main() {
  const generateResult = await generateText({
    model: google('gemini-2.5-flash'),
    prompt: 'Hello',
  });

  const streamResult = streamText({
    model: google('gemini-2.5-flash'),
    prompt: 'Hello',
  });
  for await (const _ of streamResult.fullStream) {
    void _;
  }

  const generateBoundary = normalResponse.usageMetadata;
  const streamingBoundary = streamBoundary.usageMetadata;
  const generateUsage = generateResult.finalStep.usage;
  const streamUsage = (await streamResult.finalStep).usage;

  assertNormalizedUsage('normal', generateBoundary, generateUsage);
  assertNormalizedUsage('streaming', streamingBoundary, streamUsage);

  const report = {
    generate: {
      providerBoundaryUsage: generateBoundary,
      finalStepUsageRaw: generateUsage.raw,
      deepEqual: isDeepStrictEqual(generateBoundary, generateUsage.raw),
      normalized: generateUsage,
    },
    stream: {
      providerBoundaryUsage: streamingBoundary,
      finalStepUsageRaw: streamUsage.raw,
      deepEqual: isDeepStrictEqual(streamingBoundary, streamUsage.raw),
      normalized: streamUsage,
    },
  };

  console.log(JSON.stringify(report, null, 2));

  const mismatchedPaths = [
    !report.generate.deepEqual && 'normal',
    !report.stream.deepEqual && 'streaming',
  ].filter(Boolean);

  if (mismatchedPaths.length > 0) {
    throw new Error(
      `Google usage.raw dropped provider usage metadata on ${mismatchedPaths.join(
        ' and ',
      )} path`,
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
