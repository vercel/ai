import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateText, streamText } from 'ai';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

type Usage = Record<string, unknown>;

const generateFixture = JSON.parse(
  readFileSync(
    new URL(
      '../../../../packages/google/src/__fixtures__/issue-19822-complete-usage.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as { usageMetadata: Usage };

const streamFixtureLines = readFileSync(
  new URL(
    '../../../../packages/google/src/__fixtures__/issue-19822-google-search-live.chunks.txt',
    import.meta.url,
  ),
  'utf8',
)
  .trim()
  .split('\n');

const finalStreamUsage = (
  JSON.parse(streamFixtureLines.at(-1)!) as { usageMetadata: Usage }
).usageMetadata;

async function main() {
  const google = createGoogleGenerativeAI({
    apiKey: 'test-api-key',
    fetch: async input => {
      const url = String(input);

      if (url.includes('streamGenerateContent')) {
        return new Response(
          streamFixtureLines.map(line => `data: ${line}\n\n`).join(''),
          {
            status: 200,
            headers: { 'content-type': 'text/event-stream' },
          },
        );
      }

      return new Response(JSON.stringify(generateFixture), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });

  const generateResult = await generateText({
    model: google('gemini-2.5-flash'),
    prompt: 'Return 42.',
  });

  const streamResult = streamText({
    model: google('gemini-2.5-flash'),
    prompt: 'State the current date.',
  });
  await streamResult.consumeStream();
  const streamUsage = await streamResult.usage;

  const generateRawMatches =
    JSON.stringify(generateResult.usage.raw) ===
    JSON.stringify(generateFixture.usageMetadata);
  const streamRawMatches =
    JSON.stringify(streamUsage.raw) === JSON.stringify(finalStreamUsage);

  if (!generateRawMatches || !streamRawMatches) {
    throw new Error(
      'ISSUE_19822_REPRODUCED: Google usage.raw dropped documented provider usage fields',
    );
  }

  assert.deepEqual(
    {
      inputTokens: generateResult.usage.inputTokens,
      outputTokens: generateResult.usage.outputTokens,
      totalTokens: generateResult.usage.totalTokens,
      reasoningTokens: generateResult.usage.outputTokenDetails.reasoningTokens,
      cacheReadTokens: generateResult.usage.inputTokenDetails.cacheReadTokens,
    },
    {
      inputTokens: 19,
      outputTokens: 60,
      totalTokens: 79,
      reasoningTokens: 56,
      cacheReadTokens: 3,
    },
  );

  assert.deepEqual(
    {
      inputTokens: streamUsage.inputTokens,
      outputTokens: streamUsage.outputTokens,
      totalTokens: streamUsage.totalTokens,
      reasoningTokens: streamUsage.outputTokenDetails.reasoningTokens,
      cacheReadTokens: streamUsage.inputTokenDetails.cacheReadTokens,
    },
    {
      inputTokens: 17,
      outputTokens: 370,
      totalTokens: 387,
      reasoningTokens: 333,
      cacheReadTokens: 0,
    },
  );

  console.log(
    'Issue #19822 is fixed: complete Google raw usage is preserved without changing normalized usage.',
  );
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
