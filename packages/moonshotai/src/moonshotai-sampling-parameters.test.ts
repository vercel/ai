import type { SharedV4Warning } from '@ai-sdk/provider';
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createMoonshotAI } from './moonshotai-provider';

const TEST_PROMPT = [
  {
    role: 'user' as const,
    content: [{ type: 'text' as const, text: 'Hello' }],
  },
];

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

const recordedSamplingError = JSON.parse(
  fs.readFileSync(
    'src/__fixtures__/moonshotai-unsupported-sampling-error.json',
    'utf8',
  ),
);

const successResponse = JSON.parse(
  fs.readFileSync('src/__fixtures__/moonshotai-text.json', 'utf8'),
);

function createRecordingProvider() {
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

  return { provider, requestBodies };
}

function expectSamplingWarnings(warnings: SharedV4Warning[]) {
  expect(warnings).toHaveLength(4);

  const normalizedFeatures = warnings.map(warning => {
    expect(warning.type).toBe('unsupported');
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
    expect(
      normalizedFeatures.some(warningFeature =>
        warningFeature.includes(feature),
      ),
    ).toBe(true);
  }
}

describe('sampling parameters', () => {
  it('omits sampling parameters and returns warnings for Kimi models', async () => {
    const { provider, requestBodies } = createRecordingProvider();

    for (const modelId of kimiModelIds) {
      const result = await provider.chatModel(modelId).doGenerate({
        prompt: TEST_PROMPT,
        ...samplingOptions,
      });

      const requestBody = requestBodies.at(-1)!;
      for (const field of samplingBodyFields) {
        expect(requestBody).not.toHaveProperty(field);
      }
      expectSamplingWarnings(result.warnings);
    }
  });

  it('retains sampling parameters for Moonshot V1 models', async () => {
    const { provider, requestBodies } = createRecordingProvider();

    const result = await provider.chatModel('moonshot-v1-8k').doGenerate({
      prompt: TEST_PROMPT,
      ...samplingOptions,
    });

    expect(requestBodies[0]).toMatchObject({
      temperature: 0.5,
      top_p: 0.5,
      presence_penalty: 0.5,
      frequency_penalty: 0.5,
    });
    expect(result.warnings).toEqual([]);
  });

  it('retains sampling parameters for unknown custom model IDs', async () => {
    const { provider, requestBodies } = createRecordingProvider();

    const result = await provider.chatModel('custom-model').doGenerate({
      prompt: TEST_PROMPT,
      ...samplingOptions,
    });

    expect(requestBodies[0]).toMatchObject({
      temperature: 0.5,
      top_p: 0.5,
      presence_penalty: 0.5,
      frequency_penalty: 0.5,
    });
    expect(result.warnings).toEqual([]);
  });

  it('does not change requests without sampling parameters', async () => {
    const { provider, requestBodies } = createRecordingProvider();

    const result = await provider.chatModel('kimi-k2.6').doGenerate({
      prompt: TEST_PROMPT,
    });

    for (const field of samplingBodyFields) {
      expect(requestBodies[0]).not.toHaveProperty(field);
    }
    expect(result.warnings).toEqual([]);
  });
});
