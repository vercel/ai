import { createDeepSeek } from '@ai-sdk/deepseek';
import { generateText, streamText } from 'ai';
import { readFile } from 'node:fs/promises';

const jsonFixtureUrl = new URL(
  '../../../../packages/deepseek/src/chat/__fixtures__/deepseek-system-fingerprint.json',
  import.meta.url,
);
const chunksFixtureUrl = new URL(
  '../../../../packages/deepseek/src/chat/__fixtures__/deepseek-system-fingerprint.chunks.txt',
  import.meta.url,
);

async function main() {
  const jsonFixture = JSON.parse(await readFile(jsonFixtureUrl, 'utf8'));
  const chunkFixtures = (await readFile(chunksFixtureUrl, 'utf8'))
    .trim()
    .split('\n');
  const streamFingerprints = [
    ...new Set(
      chunkFixtures.map(
        chunk => JSON.parse(chunk).system_fingerprint as string | undefined,
      ),
    ),
  ];
  const expectedGenerateFingerprint = jsonFixture.system_fingerprint as string;
  const expectedStreamFingerprint = streamFingerprints[0];

  if (
    streamFingerprints.length !== 1 ||
    expectedStreamFingerprint !== expectedGenerateFingerprint
  ) {
    throw new Error(
      'Recorded DeepSeek responses must contain one stable system_fingerprint.',
    );
  }

  const deepSeek = createDeepSeek({
    apiKey: 'test-api-key',
    fetch: async (_input, init) => {
      const requestBody =
        typeof init?.body === 'string' ? JSON.parse(init.body) : {};

      if (requestBody.stream === true) {
        return new Response(
          [
            ...chunkFixtures.map(chunk => `data: ${chunk}\n\n`),
            'data: [DONE]\n\n',
          ].join(''),
          { headers: { 'content-type': 'text/event-stream' } },
        );
      }

      return Response.json(jsonFixture);
    },
  });

  const generateResult = await generateText({
    model: deepSeek('deepseek-v4-flash'),
    prompt: 'Reply with exactly: OK',
  });
  const streamResult = streamText({
    model: deepSeek('deepseek-v4-flash'),
    prompt: 'Reply with exactly: OK',
  });

  const streamTextValue = await streamResult.text;
  const streamUsage = await streamResult.usage;
  const streamProviderMetadata = await streamResult.providerMetadata;
  const observedGenerateFingerprint =
    generateResult.providerMetadata?.deepseek.systemFingerprint;
  const observedStreamFingerprint =
    streamProviderMetadata?.deepseek.systemFingerprint;

  const output = {
    directProviderResponse: {
      generateSystemFingerprint: expectedGenerateFingerprint,
      streamSystemFingerprints: streamFingerprints,
    },
    aiSdkResult: {
      generate: {
        text: generateResult.text,
        usage: generateResult.usage,
        providerMetadata: generateResult.providerMetadata,
        systemFingerprint: observedGenerateFingerprint,
      },
      stream: {
        text: streamTextValue,
        usage: streamUsage,
        providerMetadata: streamProviderMetadata,
        systemFingerprint: observedStreamFingerprint,
      },
    },
  };

  console.log(JSON.stringify(output, null, 2));

  if (generateResult.text !== 'OK' || streamTextValue !== 'OK') {
    throw new Error('DeepSeek result content changed in the reproduction.');
  }

  if (
    generateResult.usage.inputTokens !== 9 ||
    generateResult.usage.outputTokens !== 1 ||
    generateResult.usage.totalTokens !== 10 ||
    streamUsage.inputTokens !== 9 ||
    streamUsage.outputTokens !== 1 ||
    streamUsage.totalTokens !== 10
  ) {
    throw new Error('DeepSeek result usage changed in the reproduction.');
  }

  if (
    observedGenerateFingerprint !== expectedGenerateFingerprint ||
    observedStreamFingerprint !== expectedStreamFingerprint
  ) {
    throw new Error(
      'Reproduced issue #19386: DeepSeek system_fingerprint was not preserved in provider metadata for generate and stream.',
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
