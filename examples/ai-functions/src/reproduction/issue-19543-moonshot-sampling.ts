import { createMoonshotAI } from '../../../../packages/moonshotai/src';
import assert from 'node:assert/strict';

const samplingOptions = {
  temperature: 0.2,
  topP: 0.4,
  frequencyPenalty: 0.5,
  presencePenalty: 0.6,
} as const;

const samplingBodyFields = [
  'temperature',
  'top_p',
  'frequency_penalty',
  'presence_penalty',
] as const;

const prompt = [
  {
    role: 'user' as const,
    content: [{ type: 'text' as const, text: 'Reply with OK.' }],
  },
];

function parseRequestBody(init?: RequestInit): Record<string, unknown> {
  assert.equal(typeof init?.body, 'string');
  return JSON.parse(init.body);
}

function assertSamplingFieldsOmitted(body: Record<string, unknown>) {
  for (const field of samplingBodyFields) {
    assert.equal(
      Object.hasOwn(body, field),
      false,
      `Kimi request unexpectedly included ${field}`,
    );
  }
}

function assertSamplingFieldsPreserved(body: Record<string, unknown>) {
  assert.equal(body.temperature, 0.2);
  assert.equal(body.top_p, 0.4);
  assert.equal(body.frequency_penalty, 0.5);
  assert.equal(body.presence_penalty, 0.6);
}

function successfulResponse(model: string) {
  return new Response(
    JSON.stringify({
      id: 'chatcmpl-issue-19543',
      object: 'chat.completion',
      created: 1,
      model,
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: 'OK' },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: 1,
        completion_tokens: 1,
        total_tokens: 2,
      },
    }),
    {
      status: 200,
      headers: { 'content-type': 'application/json' },
    },
  );
}

async function checkRequestShape(
  modelId: string,
  expected: 'omitted' | 'preserved',
) {
  let requestBody: Record<string, unknown> | undefined;
  const provider = createMoonshotAI({
    apiKey: 'test-api-key',
    fetch: async (_input, init) => {
      requestBody = parseRequestBody(init);
      return successfulResponse(modelId);
    },
  });

  const result = await provider.chatModel(modelId).doGenerate({
    prompt,
    ...samplingOptions,
  });

  assert.ok(requestBody);
  if (expected === 'omitted') {
    assertSamplingFieldsOmitted(requestBody);
    assert.deepEqual(
      result.warnings.map(warning =>
        warning.type === 'unsupported-setting' ? warning.setting : undefined,
      ),
      ['temperature', 'topP', 'frequencyPenalty', 'presencePenalty'],
    );
  } else {
    assertSamplingFieldsPreserved(requestBody);
    assert.deepEqual(result.warnings, []);
  }
}

async function checkUnaffectedRequest() {
  let requestBody: Record<string, unknown> | undefined;
  const provider = createMoonshotAI({
    apiKey: 'test-api-key',
    fetch: async (_input, init) => {
      requestBody = parseRequestBody(init);
      return successfulResponse('kimi-k2.6');
    },
  });

  const result = await provider.chatModel('kimi-k2.6').doGenerate({ prompt });

  assert.deepEqual(requestBody, {
    model: 'kimi-k2.6',
    messages: [{ role: 'user', content: 'Reply with OK.' }],
  });
  assert.deepEqual(result.warnings, []);
}

async function checkLiveProviderBoundary() {
  const directResponse = await fetch(
    'https://api.moonshot.ai/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${process.env.MOONSHOT_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'kimi-k2.6',
        messages: [{ role: 'user', content: 'Reply with OK.' }],
        max_completion_tokens: 1,
        thinking: { type: 'disabled' },
        temperature: samplingOptions.temperature,
        top_p: samplingOptions.topP,
        frequency_penalty: samplingOptions.frequencyPenalty,
        presence_penalty: samplingOptions.presencePenalty,
      }),
    },
  );
  const directBody = await directResponse.text();

  if ([401, 402, 403, 429].includes(directResponse.status)) {
    throw new Error(
      `Live Moonshot access blocker: HTTP ${directResponse.status} ${directBody}`,
    );
  }
  assert.equal(
    directResponse.status,
    400,
    `Direct Moonshot request unexpectedly returned HTTP ${directResponse.status}: ${directBody}`,
  );
  assert.match(directBody, /temperature/i);

  let sdkRequestBody: Record<string, unknown> | undefined;
  const provider = createMoonshotAI({
    fetch: async (input, init) => {
      sdkRequestBody = parseRequestBody(init);
      return fetch(input, init);
    },
  });
  const sdkResult = await provider.chatModel('kimi-k2.6').doGenerate({
    prompt,
    maxOutputTokens: 1,
    providerOptions: {
      moonshotai: {
        thinking: { type: 'disabled' },
      },
    },
    ...samplingOptions,
  });

  assert.ok(sdkRequestBody);
  assertSamplingFieldsOmitted(sdkRequestBody);
  assert.deepEqual(
    sdkResult.warnings.map(warning =>
      warning.type === 'unsupported-setting' ? warning.setting : undefined,
    ),
    ['temperature', 'topP', 'frequencyPenalty', 'presencePenalty'],
  );

  console.log(
    `Live boundary confirmed: direct request HTTP ${directResponse.status}; AI SDK request succeeded after omitting fixed sampling fields.`,
  );
}

async function main() {
  await checkLiveProviderBoundary();

  for (const modelId of [
    'kimi-k2.5',
    'kimi-k2.6',
    'kimi-k2.7-code',
    'kimi-k2.7-code-highspeed',
    'kimi-k3',
  ]) {
    await checkRequestShape(modelId, 'omitted');
  }
  await checkRequestShape('moonshot-v1-8k', 'preserved');
  await checkRequestShape('custom-model', 'preserved');
  await checkUnaffectedRequest();

  console.log(
    'Issue #19543 could not be reproduced: all known Kimi models omit the four sampling fields with warnings, while Moonshot V1 and custom models preserve them.',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
