import { createMoonshotAI } from '@ai-sdk/moonshotai';
import type { SharedV4Warning } from '@ai-sdk/provider';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const REPRODUCTION_SIGNAL =
  'ISSUE #19543 REPRODUCED: Moonshot rejected sampling parameters forwarded by the AI SDK for kimi-k2.6';

const samplingOptions = {
  temperature: 0.5,
  topP: 0.5,
  presencePenalty: 0.5,
  frequencyPenalty: 0.5,
};

const samplingBodyFields = [
  'temperature',
  'top_p',
  'presence_penalty',
  'frequency_penalty',
] as const;

const kimiModelIds = [
  'kimi-k2.6',
  'kimi-k3',
  'kimi-k2.7-code',
  'kimi-k2.7-code-highspeed',
  'kimi-k2.5',
] as const;

function assertSamplingWarnings(warnings: SharedV4Warning[]) {
  assert.equal(warnings.length, 4, 'expected one warning per sampling setting');

  const normalizedFeatures = warnings.map(warning => {
    assert.equal(warning.type, 'unsupported');
    return warning.type === 'unsupported'
      ? warning.feature.toLowerCase().replace(/[^a-z]/g, '')
      : '';
  });

  for (const feature of [
    'temperature',
    'topp',
    'presencepenalty',
    'frequencypenalty',
  ]) {
    assert.ok(
      normalizedFeatures.some(warningFeature =>
        warningFeature.includes(feature),
      ),
      `missing warning for ${feature}`,
    );
  }
}

async function main() {
  const recordedSamplingError = JSON.parse(
    await readFile(
      new URL(
        '../../../../packages/moonshotai/src/__fixtures__/moonshotai-unsupported-sampling-error.json',
        import.meta.url,
      ),
      'utf8',
    ),
  );

  const successResponse = JSON.parse(
    await readFile(
      new URL(
        '../../../../packages/moonshotai/src/__fixtures__/moonshotai-text.json',
        import.meta.url,
      ),
      'utf8',
    ),
  );

  const requestBodies: Array<Record<string, unknown>> = [];
  const provider = createMoonshotAI({
    apiKey: 'test-api-key',
    fetch: async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      requestBodies.push(body);

      const hasUnsupportedSamplingField =
        kimiModelIds.includes(body.model as (typeof kimiModelIds)[number]) &&
        samplingBodyFields.some(field => body[field] !== undefined);

      if (hasUnsupportedSamplingField) {
        return new Response(JSON.stringify(recordedSamplingError), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response(
        JSON.stringify({ ...successResponse, model: body.model }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    },
  });

  try {
    for (const modelId of kimiModelIds) {
      const result = await provider.chatModel(modelId).doGenerate({
        prompt: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'Reply with OK.' }],
          },
        ],
        ...samplingOptions,
      });

      const requestBody = requestBodies.at(-1)!;
      for (const field of samplingBodyFields) {
        assert.equal(
          requestBody[field],
          undefined,
          `${modelId} request included ${field}`,
        );
      }
      assertSamplingWarnings(result.warnings);
    }
  } catch (error) {
    const apiError = error as { statusCode?: number; message?: string };
    if (
      apiError.statusCode === 400 &&
      apiError.message?.includes(
        'invalid temperature: only 0.6 is allowed for this model',
      )
    ) {
      throw new Error(REPRODUCTION_SIGNAL);
    }
    throw error;
  }

  for (const modelId of ['moonshot-v1-8k', 'custom-model']) {
    const result = await provider.chatModel(modelId).doGenerate({
      prompt: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'Reply with OK.' }],
        },
      ],
      ...samplingOptions,
    });

    assert.deepEqual(
      Object.fromEntries(
        samplingBodyFields.map(field => [field, requestBodies.at(-1)![field]]),
      ),
      {
        temperature: 0.5,
        top_p: 0.5,
        presence_penalty: 0.5,
        frequency_penalty: 0.5,
      },
    );
    assert.deepEqual(result.warnings, []);
  }

  const unaffectedResult = await provider.chatModel('kimi-k2.6').doGenerate({
    prompt: [
      {
        role: 'user',
        content: [{ type: 'text', text: 'Reply with OK.' }],
      },
    ],
  });

  for (const field of samplingBodyFields) {
    assert.equal(requestBodies.at(-1)![field], undefined);
  }
  assert.deepEqual(unaffectedResult.warnings, []);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
