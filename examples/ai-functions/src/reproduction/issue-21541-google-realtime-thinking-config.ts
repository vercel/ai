import {
  Experimental_GoogleRealtimeModel,
  type Experimental_GoogleRealtimeModelOptions as GoogleRealtimeModelOptions,
} from '@ai-sdk/google';
import assert from 'node:assert/strict';

const model = new Experimental_GoogleRealtimeModel(
  'gemini-3.8-live-extended-thinking',
  {
    provider: 'google.generative-ai.realtime',
    baseURL: 'https://generativelanguage.googleapis.com/v1beta',
    headers: () => ({}),
  },
);

function getThinkingConfig(
  sessionConfig: Parameters<typeof model.buildSessionConfig>[0],
) {
  const setup = model.buildSessionConfig(sessionConfig);
  const generationConfig = setup.generationConfig;
  assert.ok(
    generationConfig != null &&
      typeof generationConfig === 'object' &&
      !Array.isArray(generationConfig),
    'setup is missing generationConfig',
  );

  const thinkingConfig = (generationConfig as Record<string, unknown>)
    .thinkingConfig;
  assert.ok(
    thinkingConfig != null &&
      typeof thinkingConfig === 'object' &&
      !Array.isArray(thinkingConfig),
    'setup is missing thinkingConfig',
  );

  return thinkingConfig;
}

async function main() {
  assert.deepEqual(
    getThinkingConfig({
      providerOptions: {
        google: {
          thinkingConfig: { includeThoughts: true },
        } satisfies GoogleRealtimeModelOptions,
      },
    }),
    { includeThoughts: true, thinkingLevel: 'low' },
    'a partial typed thinkingConfig must receive the default thinkingLevel',
  );

  assert.deepEqual(
    getThinkingConfig({
      providerOptions: {
        google: {
          thinkingConfig: {},
        } satisfies GoogleRealtimeModelOptions,
      },
    }),
    { thinkingLevel: 'low' },
    'an empty typed thinkingConfig must receive the default thinkingLevel',
  );

  assert.deepEqual(
    getThinkingConfig({
      providerOptions: {
        generationConfig: {
          thinkingConfig: { thinkingLevel: 'high' },
        },
      },
    }),
    { thinkingLevel: 'high' },
    'an explicit raw thinkingLevel must not be overwritten',
  );

  assert.deepEqual(
    getThinkingConfig({
      providerOptions: {
        generationConfig: {
          thinkingConfig: { thinkingBudget: 1024 },
        },
      },
    }),
    { thinkingBudget: 1024 },
    'an explicit raw thinkingBudget must not be overwritten',
  );

  console.log(
    'Issue #21541 not reproduced: all Google Realtime thinking configs are preserved or defaulted correctly.',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
