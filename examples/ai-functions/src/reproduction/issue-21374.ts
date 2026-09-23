import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import type { LanguageModelV4CallOptions } from '@ai-sdk/provider';
import { generateText } from 'ai';
import assert from 'node:assert/strict';

type InferenceConfig = {
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  topK?: number;
  stopSequences?: string[];
};

type CapturedRequest = {
  modelId: string;
  route: 'converse' | 'converse-stream';
  inferenceConfig: InferenceConfig;
};

const liveErrorMessages = {
  temperature:
    "This model doesn't support the temperature field. Remove temperature and try again.",
  topP: "This model doesn't support the topP field. Remove topP and try again.",
  stopSequences:
    "This model doesn't support the stopSequences field. Remove stopSequences and try again.",
} as const;

const successBody = {
  metrics: { latencyMs: 490 },
  output: {
    message: { content: [{ text: 'ok' }], role: 'assistant' },
  },
  stopReason: 'end_turn',
  usage: {
    cacheReadInputTokenCount: 0,
    cacheReadInputTokens: 0,
    cacheWriteInputTokenCount: 0,
    cacheWriteInputTokens: 0,
    inputTokens: 9,
    outputTokens: 5,
    serverToolUsage: {},
    totalTokens: 14,
  },
};

function findRejectedFeature(
  modelId: string,
  inferenceConfig: InferenceConfig,
): keyof typeof liveErrorMessages | undefined {
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

function createRecordedBedrock() {
  const requests: CapturedRequest[] = [];
  const bedrock = createAmazonBedrock({
    apiKey: 'bedrock-api-key-test',
    region: 'us-east-1',
    fetch: async (input, init) => {
      const url = input.toString();
      const route = url.endsWith('/converse-stream')
        ? 'converse-stream'
        : 'converse';
      const modelId = decodeURIComponent(
        url.match(/\/model\/([^/]+)\/converse/)?.[1] ?? 'unknown',
      );
      const body = JSON.parse(String(init?.body)) as {
        inferenceConfig?: InferenceConfig;
      };
      const inferenceConfig = body.inferenceConfig ?? {};

      requests.push({ modelId, route, inferenceConfig });

      const rejectedFeature = findRejectedFeature(modelId, inferenceConfig);
      if (rejectedFeature != null) {
        return new Response(
          JSON.stringify({ message: liveErrorMessages[rejectedFeature] }),
          {
            status: 400,
            headers: { 'content-type': 'application/json' },
          },
        );
      }

      if (route === 'converse-stream') {
        return new Response(new Uint8Array(), {
          status: 200,
          headers: {
            'content-type': 'application/vnd.amazon.eventstream',
          },
        });
      }

      return new Response(JSON.stringify(successBody), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });

  return { bedrock, requests };
}

function getUnsupportedFeatures(
  warnings: Array<{ type: string; feature?: string }>,
) {
  return warnings
    .filter(warning => warning.type === 'unsupported')
    .map(warning => warning.feature);
}

async function checkGenerate({
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
  const { bedrock, requests } = createRecordedBedrock();
  const result = await generateText({
    model: bedrock(modelId),
    prompt: 'Say ok.',
    ...options,
  });

  assert.equal(result.text, 'ok');
  assert.deepEqual(requests.at(-1)?.inferenceConfig, expectedInferenceConfig);
  assert.deepEqual(
    getUnsupportedFeatures(result.warnings ?? []),
    expectedWarnings,
  );
}

async function checkClosedOpenAIModels() {
  for (const modelId of [
    'us.openai.gpt-5.6-sol',
    'us.openai.gpt-5.6-luna',
    'global.openai.gpt-5.6-sol',
    'global.openai.gpt-5.6-luna',
  ]) {
    await checkGenerate({
      modelId,
      options: { maxOutputTokens: 20, temperature: 0.2 },
      expectedInferenceConfig: { maxTokens: 20 },
      expectedWarnings: ['temperature'],
    });
  }

  for (const temperature of [0, 1]) {
    await checkGenerate({
      modelId: 'us.openai.gpt-5.6-sol',
      options: { maxOutputTokens: 20, temperature },
      expectedInferenceConfig: { maxTokens: 20 },
      expectedWarnings: ['temperature'],
    });
  }

  await checkGenerate({
    modelId: 'us.openai.gpt-5.6-luna',
    options: { maxOutputTokens: 20, topP: 0.5 },
    expectedInferenceConfig: { maxTokens: 20 },
    expectedWarnings: ['topP'],
  });

  for (const stopSequences of [['END'], []]) {
    await checkGenerate({
      modelId: 'us.openai.gpt-5.6-luna',
      options: { maxOutputTokens: 20, stopSequences },
      expectedInferenceConfig: { maxTokens: 20 },
      expectedWarnings: ['stopSequences'],
    });
  }

  await checkGenerate({
    modelId: 'us.openai.gpt-5.6-sol',
    options: { maxOutputTokens: 20, temperature: 0, topK: 5 },
    expectedInferenceConfig: { maxTokens: 20, topK: 5 },
    expectedWarnings: ['temperature'],
  });
}

async function checkStreaming() {
  const { bedrock, requests } = createRecordedBedrock();
  const result = await bedrock('us.openai.gpt-5.6-luna').doStream({
    prompt: [{ role: 'user', content: [{ type: 'text', text: 'Say ok.' }] }],
    temperature: 0.2,
    includeRawChunks: false,
  });

  const reader = result.stream.getReader();
  while (!(await reader.read()).done) {
    // Consume the stream so transport and terminal stream behavior are checked.
  }

  assert.deepEqual(requests.at(-1)?.inferenceConfig, {});
}

async function checkControls() {
  await checkGenerate({
    modelId: 'openai.gpt-oss-120b-1:0',
    options: { temperature: 0.2, topP: 0.5 },
    expectedInferenceConfig: { temperature: 0.2, topP: 0.5 },
    expectedWarnings: [],
  });

  await checkGenerate({
    modelId: 'openai.gpt-oss-120b-1:0',
    options: { stopSequences: ['END'] },
    expectedInferenceConfig: {},
    expectedWarnings: ['stopSequences'],
  });

  await checkGenerate({
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
}

async function main() {
  const failures: string[] = [];

  for (const [name, check] of [
    ['closed OpenAI generate calls', checkClosedOpenAIModels],
    ['closed OpenAI streaming call', checkStreaming],
    ['gpt-oss and Anthropic controls', checkControls],
  ] as const) {
    try {
      await check();
    } catch (error) {
      failures.push(
        `${name}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  if (failures.length > 0) {
    console.error(
      `ISSUE_21374_REPRODUCED: Amazon Bedrock OpenAI calls fail with HTTP 400 because unsupported sampling fields are forwarded.\n${failures.join('\n')}`,
    );
    process.exitCode = 1;
    return;
  }

  console.log('Issue #21374 behavior is fixed.');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
