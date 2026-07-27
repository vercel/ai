import { createXai } from '@ai-sdk/xai';
import { generateText, streamText } from 'ai';
import fs from 'node:fs/promises';

globalThis.AI_SDK_LOG_WARNINGS = false;

const expectedWarnings = [
  { type: 'unsupported', feature: 'topK' },
  { type: 'unsupported', feature: 'presencePenalty' },
  { type: 'unsupported', feature: 'frequencyPenalty' },
] as const;

const settings = {
  prompt: 'Reply with only: OK',
  maxOutputTokens: 8,
  topK: 10,
  presencePenalty: 0.5,
  frequencyPenalty: 0.5,
} as const;

function includesExpectedWarnings(
  warnings: ReadonlyArray<{ type: string; feature?: string }>,
) {
  return expectedWarnings.every(expected =>
    warnings.some(
      actual =>
        actual.type === expected.type && actual.feature === expected.feature,
    ),
  );
}

async function main() {
  const fixtureDirectory = new URL(
    '../../../../packages/xai/src/responses/__fixtures__/',
    import.meta.url,
  );
  const generateFixture = await fs.readFile(
    new URL('issue-17936-generate.json', fixtureDirectory),
    'utf8',
  );
  const streamFixture = await fs.readFile(
    new URL('issue-17936-stream.chunks.txt', fixtureDirectory),
    'utf8',
  );
  const chatFixture = await fs.readFile(
    new URL('issue-17936-chat.json', fixtureDirectory),
    'utf8',
  );
  const requests: unknown[] = [];

  const xai = createXai({
    apiKey: 'test-key',
    fetch: async (_input, init) => {
      const request = JSON.parse(String(init?.body));
      requests.push(request);

      if (request.stream === true) {
        const body = `${streamFixture
          .trim()
          .split('\n')
          .map(line => `data: ${line}\n\n`)
          .join('')}data: [DONE]\n\n`;
        return new Response(body, {
          headers: { 'content-type': 'text/event-stream' },
        });
      }

      return new Response(
        request.input == null ? chatFixture : generateFixture,
        { headers: { 'content-type': 'application/json' } },
      );
    },
  });

  const generated = await generateText({
    model: xai.responses('grok-4'),
    ...settings,
  });
  const streamed = streamText({
    model: xai.responses('grok-4'),
    ...settings,
  });
  await streamed.consumeStream();
  const generateWarnings = generated.warnings ?? [];
  const streamWarnings = (await streamed.warnings) ?? [];
  const defaultModel = await generateText({
    model: xai('grok-4'),
    ...settings,
  });
  const generateHasExpectedWarnings =
    includesExpectedWarnings(generateWarnings);
  const streamHasExpectedWarnings = includesExpectedWarnings(streamWarnings);

  const omittedRequestFields = requests.slice(0, 2).every(request => {
    const body = request as Record<string, unknown>;
    return (
      body.top_k == null &&
      body.presence_penalty == null &&
      body.frequency_penalty == null
    );
  });

  console.log(
    JSON.stringify(
      {
        responsesGenerateWarnings: generateWarnings,
        responsesStreamWarnings: streamWarnings,
        defaultModelWarnings: defaultModel.warnings,
        omittedRequestFields,
      },
      null,
      2,
    ),
  );

  if (!generateHasExpectedWarnings || !streamHasExpectedWarnings) {
    throw new Error(
      'ISSUE_17936_REPRODUCED: xAI Responses returned no unsupported warnings for topK, presencePenalty, and frequencyPenalty in generateText and streamText',
    );
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
