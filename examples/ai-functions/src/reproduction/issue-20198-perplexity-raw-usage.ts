import { createPerplexity } from '@ai-sdk/perplexity';
import { generateText, streamText } from 'ai';
import fs from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';

type Usage = {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  [key: string]: unknown;
};

const fixtureDirectory = new URL(
  '../../../../packages/perplexity/src/__fixtures__/',
  import.meta.url,
);

async function main() {
  const normalBody = await fs.readFile(
    new URL('perplexity-usage-raw-live.json', fixtureDirectory),
    'utf8',
  );
  const streamLines = (
    await fs.readFile(
      new URL('perplexity-usage-raw-live.chunks.txt', fixtureDirectory),
      'utf8',
    )
  )
    .split('\n')
    .filter(line => line.length > 0);

  const normalProviderUsage = (JSON.parse(normalBody) as { usage: Usage })
    .usage;
  const terminalProviderUsage = (
    JSON.parse(streamLines.at(-1)!) as { usage: Usage }
  ).usage;

  const provider = createPerplexity({
    apiKey: 'reproduction-key',
    fetch: async (_input, init) => {
      const requestBody = JSON.parse(String(init?.body)) as {
        stream?: boolean;
      };

      if (requestBody.stream) {
        return new Response(
          `${streamLines.map(line => `data: ${line}\n\n`).join('')}data: [DONE]\n\n`,
          { headers: { 'content-type': 'text/event-stream' } },
        );
      }

      return new Response(normalBody, {
        headers: { 'content-type': 'application/json' },
      });
    },
  });

  const normalResult = await generateText({
    model: provider('sonar'),
    prompt: 'Reply with exactly OK.',
    maxOutputTokens: 16,
  });

  const streamResult = streamText({
    model: provider('sonar'),
    prompt: 'Reply with exactly OK.',
    maxOutputTokens: 16,
  });
  await streamResult.consumeStream();
  const streamUsage = await streamResult.usage;

  if (
    normalResult.usage.totalTokens !== normalProviderUsage.total_tokens ||
    streamUsage.totalTokens !== terminalProviderUsage.total_tokens
  ) {
    throw new Error(
      'Reproduction setup failed: normalized token accounting changed.',
    );
  }

  const normalPreserved = isDeepStrictEqual(
    normalResult.usage.raw,
    normalProviderUsage,
  );
  const terminalStreamPreserved = isDeepStrictEqual(
    streamUsage.raw,
    terminalProviderUsage,
  );

  if (!normalPreserved || !terminalStreamPreserved) {
    throw new Error(
      'ISSUE_20198: Perplexity usage.raw dropped provider fields in normal and streaming results',
    );
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
