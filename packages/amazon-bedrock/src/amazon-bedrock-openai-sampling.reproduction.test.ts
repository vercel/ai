import type {
  LanguageModelV4CallOptions,
  LanguageModelV4Prompt,
} from '@ai-sdk/provider';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AmazonBedrockChatLanguageModel } from './amazon-bedrock-chat-language-model';

type InferenceConfig = {
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  topK?: number;
  stopSequences?: string[];
};

const TEST_PROMPT: LanguageModelV4Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Say ok.' }] },
];

const successFixture = readFixture(
  'amazon-bedrock-openai-gpt-5.6-success.json',
);
const errorFixtures = {
  temperature: readFixture('amazon-bedrock-openai-temperature-error.json'),
  topP: readFixture('amazon-bedrock-openai-top-p-error.json'),
  stopSequences: readFixture('amazon-bedrock-openai-stop-sequences-error.json'),
};

function readFixture(filename: string): unknown {
  return JSON.parse(
    fs.readFileSync(
      new URL(`./__fixtures__/${filename}`, import.meta.url),
      'utf8',
    ),
  );
}

function findRejectedFeature(
  modelId: string,
  inferenceConfig: InferenceConfig,
): keyof typeof errorFixtures | undefined {
  const openAIModelId = /^(?:[^.]+\.)?(openai\..+)$/.exec(modelId)?.[1];
  if (openAIModelId == null) {
    return undefined;
  }

  if (openAIModelId.startsWith('openai.gpt-oss-')) {
    return 'stopSequences' in inferenceConfig ? 'stopSequences' : undefined;
  }

  for (const feature of ['temperature', 'topP', 'stopSequences'] as const) {
    if (feature in inferenceConfig) {
      return feature;
    }
  }

  return undefined;
}

function createModel(modelId: string) {
  const requestBodies: Array<{ inferenceConfig?: InferenceConfig }> = [];
  const model = new AmazonBedrockChatLanguageModel(modelId, {
    baseUrl: () => 'https://bedrock-runtime.us-east-1.amazonaws.com',
    headers: {},
    generateId: () => 'test-id',
    fetch: async (input, init) => {
      const body = JSON.parse(String(init?.body)) as {
        inferenceConfig?: InferenceConfig;
      };
      requestBodies.push(body);

      const rejectedFeature = findRejectedFeature(
        modelId,
        body.inferenceConfig ?? {},
      );
      if (rejectedFeature != null) {
        return new Response(JSON.stringify(errorFixtures[rejectedFeature]), {
          status: 400,
          headers: { 'content-type': 'application/json' },
        });
      }

      if (input.toString().endsWith('/converse-stream')) {
        return new Response(new Uint8Array(), {
          status: 200,
          headers: {
            'content-type': 'application/vnd.amazon.eventstream',
          },
        });
      }

      return new Response(JSON.stringify(successFixture), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });

  return { model, requestBodies };
}

function unsupportedFeatures(
  warnings: Array<{ type: string; feature?: string }>,
) {
  return warnings
    .filter(warning => warning.type === 'unsupported')
    .map(warning => warning.feature);
}

async function expectGenerateSuccess({
  modelId,
  options,
  expectedInferenceConfig,
  expectedWarnings,
}: {
  modelId: string;
  options: Pick<
    LanguageModelV4CallOptions,
    'maxOutputTokens' | 'temperature' | 'topP' | 'topK' | 'stopSequences'
  >;
  expectedInferenceConfig: InferenceConfig;
  expectedWarnings: string[];
}) {
  const { model, requestBodies } = createModel(modelId);
  const result = await model.doGenerate({
    prompt: TEST_PROMPT,
    ...options,
  });

  expect(result.content).toEqual([{ type: 'text', text: 'ok' }]);
  expect(requestBodies.at(-1)?.inferenceConfig ?? {}).toEqual(
    expectedInferenceConfig,
  );
  expect(unsupportedFeatures(result.warnings)).toEqual(expectedWarnings);
}

describe('issue #21374 OpenAI sampling settings on Bedrock Converse', () => {
  it.each([
    'us.openai.gpt-5.6-sol',
    'us.openai.gpt-5.6-luna',
    'global.openai.gpt-5.6-sol',
    'global.openai.gpt-5.6-luna',
  ])(
    'drops temperature, topP, and stopSequences for %s while retaining topK',
    async modelId => {
      await expectGenerateSuccess({
        modelId,
        options: {
          maxOutputTokens: 20,
          temperature: 0.2,
          topP: 0.5,
          topK: 5,
          stopSequences: ['END'],
        },
        expectedInferenceConfig: { maxTokens: 20, topK: 5 },
        expectedWarnings: ['temperature', 'topP', 'stopSequences'],
      });
    },
  );

  it.each([0, 1])('drops temperature value %s', async temperature => {
    await expectGenerateSuccess({
      modelId: 'us.openai.gpt-5.6-sol',
      options: { temperature },
      expectedInferenceConfig: {},
      expectedWarnings: ['temperature'],
    });
  });

  it('drops an empty stopSequences array', async () => {
    await expectGenerateSuccess({
      modelId: 'us.openai.gpt-5.6-luna',
      options: { stopSequences: [] },
      expectedInferenceConfig: {},
      expectedWarnings: ['stopSequences'],
    });
  });

  it('drops temperature for ConverseStream so streaming can start', async () => {
    const { model, requestBodies } = createModel('us.openai.gpt-5.6-luna');
    const result = await model.doStream({
      prompt: TEST_PROMPT,
      temperature: 0.2,
      includeRawChunks: false,
    });

    expect(requestBodies.at(-1)?.inferenceConfig ?? {}).toEqual({});
    const streamParts = await convertReadableStreamToArray(result.stream);
    expect(streamParts[0]).toMatchObject({
      type: 'stream-start',
      warnings: [
        {
          type: 'unsupported',
          feature: 'temperature',
        },
      ],
    });
  });

  it('retains temperature and topP but drops stopSequences for gpt-oss', async () => {
    await expectGenerateSuccess({
      modelId: 'openai.gpt-oss-120b-1:0',
      options: {
        temperature: 0.2,
        topP: 0.5,
        stopSequences: ['END'],
      },
      expectedInferenceConfig: { temperature: 0.2, topP: 0.5 },
      expectedWarnings: ['stopSequences'],
    });
  });

  it('leaves Anthropic sampling settings unchanged', async () => {
    await expectGenerateSuccess({
      modelId: 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
      options: {
        temperature: 0.2,
        topP: 0.5,
        stopSequences: ['END'],
      },
      expectedInferenceConfig: {
        temperature: 0.2,
        topP: 0.5,
        stopSequences: ['END'],
      },
      expectedWarnings: [],
    });
  });
});
