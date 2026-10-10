import assert from 'node:assert/strict';
import type { LanguageModelV4CallOptions } from '@ai-sdk/provider';
import { generateText, streamText } from 'ai';
import { convertArrayToReadableStream, MockLanguageModelV4 } from 'ai/test';

const settingKeys = [
  'temperature',
  'topP',
  'topK',
  'presencePenalty',
  'frequencyPenalty',
] as const;

type SettingKey = (typeof settingKeys)[number];
type Api = 'generateText' | 'streamText';

const usage = {
  inputTokens: {
    total: 1,
    noCache: 1,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: {
    total: 1,
    text: 1,
    reasoning: undefined,
  },
};

async function runInvalidCase({
  api,
  key,
  value,
}: {
  api: Api;
  key: SettingKey;
  value: number;
}) {
  let errorName: string | undefined;

  if (api === 'generateText') {
    const model = new MockLanguageModelV4({
      doGenerate: async () => ({
        content: [{ type: 'text', text: 'ok' }],
        warnings: [],
        finishReason: { unified: 'stop', raw: 'stop' },
        usage,
      }),
    });

    try {
      await generateText({
        model,
        prompt: 'Hello',
        [key]: value,
        maxRetries: 0,
      });
    } catch (error) {
      errorName = error instanceof Error ? error.name : String(error);
    }

    const received = model.doGenerateCalls[0];
    return {
      api,
      key,
      value: String(value),
      calls: model.doGenerateCalls.length,
      received: received == null ? undefined : serializeSetting(key, received),
      errorName,
    };
  }

  const model = new MockLanguageModelV4({
    doStream: async () => ({
      stream: convertArrayToReadableStream([
        { type: 'stream-start', warnings: [] },
        {
          type: 'finish',
          finishReason: { unified: 'stop', raw: 'stop' },
          usage,
        },
      ]),
    }),
  });

  const result = streamText({
    model,
    prompt: 'Hello',
    [key]: value,
    maxRetries: 0,
    onError: ({ error }) => {
      errorName = error instanceof Error ? error.name : String(error);
    },
  });
  await result.consumeStream();

  const received = model.doStreamCalls[0];
  return {
    api,
    key,
    value: String(value),
    calls: model.doStreamCalls.length,
    received: received == null ? undefined : serializeSetting(key, received),
    errorName,
  };
}

function serializeSetting(
  key: SettingKey,
  options: LanguageModelV4CallOptions,
) {
  return JSON.stringify({ [key]: options[key] });
}

async function verifyFiniteSettings(api: Api) {
  const finiteSettings = {
    temperature: 0,
    topP: 0.9,
    topK: 1,
    presencePenalty: 0,
    frequencyPenalty: -0.5,
  };

  if (api === 'generateText') {
    const model = new MockLanguageModelV4({
      doGenerate: async () => ({
        content: [{ type: 'text', text: 'ok' }],
        warnings: [],
        finishReason: { unified: 'stop', raw: 'stop' },
        usage,
      }),
    });

    await generateText({
      model,
      prompt: 'Hello',
      maxRetries: 0,
      ...finiteSettings,
    });

    assert.equal(model.doGenerateCalls.length, 1);
    assert.deepEqual(
      Object.fromEntries(
        settingKeys.map(key => [key, model.doGenerateCalls[0][key]]),
      ),
      finiteSettings,
    );
    return;
  }

  const model = new MockLanguageModelV4({
    doStream: async () => ({
      stream: convertArrayToReadableStream([
        { type: 'stream-start', warnings: [] },
        {
          type: 'finish',
          finishReason: { unified: 'stop', raw: 'stop' },
          usage,
        },
      ]),
    }),
  });

  const result = streamText({
    model,
    prompt: 'Hello',
    maxRetries: 0,
    ...finiteSettings,
  });
  await result.consumeStream();

  assert.equal(model.doStreamCalls.length, 1);
  assert.deepEqual(
    Object.fromEntries(
      settingKeys.map(key => [key, model.doStreamCalls[0][key]]),
    ),
    finiteSettings,
  );
}

async function main() {
  await verifyFiniteSettings('generateText');
  await verifyFiniteSettings('streamText');

  const results = [];
  for (const api of ['generateText', 'streamText'] as const) {
    for (const key of settingKeys) {
      for (const value of [
        Number.NaN,
        Number.POSITIVE_INFINITY,
        Number.NEGATIVE_INFINITY,
      ]) {
        results.push(await runInvalidCase({ api, key, value }));
      }
    }
  }

  console.log(JSON.stringify(results, null, 2));

  const providerCallCount = results.reduce(
    (total, result) => total + result.calls,
    0,
  );
  const allRejectedLocally = results.every(
    result =>
      result.calls === 0 && result.errorName === 'AI_InvalidArgumentError',
  );

  if (!allRejectedLocally) {
    throw new Error(
      `ISSUE_22688_REPRODUCED: ${providerCallCount}/30 non-finite generation settings reached the provider instead of throwing AI_InvalidArgumentError`,
    );
  }
}

main();
