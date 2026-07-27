import { createXai } from '@ai-sdk/xai';
import { generateText, streamText, type CallWarning } from 'ai';
import fs from 'node:fs';

const EXPECTED_FEATURES = [
  'topK',
  'presencePenalty',
  'frequencyPenalty',
] as const;

const generateFixture = JSON.parse(
  fs.readFileSync(
    new URL(
      '../../../../packages/xai/src/responses/__fixtures__/xai-web-search-tool.1.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as unknown;

const streamFixture = fs
  .readFileSync(
    new URL(
      '../../../../packages/xai/src/responses/__fixtures__/xai-text-streaming.1.chunks.txt',
      import.meta.url,
    ),
    'utf8',
  )
  .split('\n')
  .map(line => `data: ${line}\n\n`)
  .concat('data: [DONE]\n\n')
  .join('');

function getUnsupportedFeatures(warnings: CallWarning[] | undefined) {
  return (
    warnings
      ?.filter(warning => warning.type === 'unsupported')
      .map(warning => warning.feature) ?? []
  );
}

async function main() {
  const requestBodies: Array<Record<string, unknown>> = [];
  const provider = createXai({
    apiKey: 'test-key',
    fetch: async (_url, init) => {
      const body = (await new Response(init?.body).json()) as Record<
        string,
        unknown
      >;
      requestBodies.push(body);

      if (body.stream === true) {
        return new Response(streamFixture, {
          headers: { 'content-type': 'text/event-stream' },
        });
      }

      return Response.json(generateFixture);
    },
  });

  const settings = {
    prompt: 'hello',
    topK: 10,
    presencePenalty: 0.5,
    frequencyPenalty: 0.5,
  } as const;

  const generated = await generateText({
    model: provider('grok-4'),
    ...settings,
  });

  const streamed = streamText({
    model: provider('grok-4'),
    ...settings,
  });
  await streamed.consumeStream();

  const generateWarnings = getUnsupportedFeatures(generated.warnings);
  const streamWarnings = getUnsupportedFeatures(await streamed.warnings);
  const missingGenerateWarnings = EXPECTED_FEATURES.filter(
    feature => !generateWarnings.includes(feature),
  );
  const missingStreamWarnings = EXPECTED_FEATURES.filter(
    feature => !streamWarnings.includes(feature),
  );
  const requestFields = requestBodies.map(body => ({
    top_k: body.top_k,
    presence_penalty: body.presence_penalty,
    frequency_penalty: body.frequency_penalty,
  }));

  console.log(
    JSON.stringify(
      {
        provider: provider('grok-4').provider,
        generateWarnings,
        streamWarnings,
        missingGenerateWarnings,
        missingStreamWarnings,
        requestFields,
      },
      null,
      2,
    ),
  );

  if (missingGenerateWarnings.length > 0 || missingStreamWarnings.length > 0) {
    throw new Error(
      'Issue #17936 reproduced: xAI Responses silently dropped unsupported sampling settings',
    );
  }
}

main();
