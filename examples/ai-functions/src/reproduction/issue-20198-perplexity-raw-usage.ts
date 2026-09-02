import { createPerplexity } from '@ai-sdk/perplexity';
import { generateText, streamText } from 'ai';
import { isDeepStrictEqual } from 'node:util';
import { readFile } from 'node:fs/promises';

const normalFixtureUrl = new URL(
  '../../../../packages/perplexity/src/__fixtures__/perplexity-usage-raw-live.json',
  import.meta.url,
);
const streamFixtureUrl = new URL(
  '../../../../packages/perplexity/src/__fixtures__/perplexity-usage-raw-live.chunks.txt',
  import.meta.url,
);

async function main() {
  const normalFixture = JSON.parse(
    await readFile(normalFixtureUrl, 'utf8'),
  ) as {
    usage: unknown;
  };
  const streamLines = (await readFile(streamFixtureUrl, 'utf8'))
    .trim()
    .split('\n');
  const terminalStreamUsage = (
    JSON.parse(streamLines.at(-1)!) as { usage: unknown }
  ).usage;

  const provider = createPerplexity({
    apiKey: 'reproduction-api-key',
    fetch: async (_input, init) => {
      const request = JSON.parse(String(init?.body)) as { stream?: boolean };

      if (request.stream) {
        return new Response(
          `${streamLines.map(line => `data: ${line}\n\n`).join('')}data: [DONE]\n\n`,
          { headers: { 'content-type': 'text/event-stream' } },
        );
      }

      return new Response(
        JSON.stringify({
          ...normalFixture,
          id: 'sanitized-live-normal-response',
          model: 'sonar',
          created: 1788310800,
          object: 'chat.completion',
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: 'OK' },
              finish_reason: 'stop',
            },
          ],
        }),
        { headers: { 'content-type': 'application/json' } },
      );
    },
  });

  const normalResult = await generateText({
    model: provider('sonar'),
    prompt: 'Reply with one short word.',
    maxOutputTokens: 16,
  });

  const streamingResult = streamText({
    model: provider('sonar'),
    prompt: 'Reply with one short word.',
    maxOutputTokens: 16,
  });
  await streamingResult.consumeStream();
  const streamingFinalStep = await streamingResult.finalStep;

  const rawUsageMismatches = [
    !isDeepStrictEqual(normalResult.finalStep.usage.raw, normalFixture.usage)
      ? 'normal'
      : undefined,
    !isDeepStrictEqual(streamingFinalStep.usage.raw, terminalStreamUsage)
      ? 'streaming'
      : undefined,
  ].filter((value): value is string => value != null);

  if (
    normalResult.finalStep.usage.totalTokens !== 7 ||
    streamingFinalStep.usage.totalTokens !== 7
  ) {
    throw new Error(
      'REPRODUCTION_HARNESS_FAILURE: normalized token accounting changed',
    );
  }

  if (rawUsageMismatches.length > 0) {
    throw new Error(
      `ISSUE_20198_REPRODUCED: incomplete final-step usage.raw for ${rawUsageMismatches.join(
        ' and ',
      )} Perplexity calls`,
    );
  }

  console.log(
    'Issue #20198 not reproduced: complete Perplexity usage objects were preserved.',
  );
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
