import { createMoonshotAI } from '@ai-sdk/moonshotai';
import assert from 'node:assert/strict';
import { generateText } from 'ai';

const samplingOptions = {
  temperature: 0.2,
  topP: 0.4,
  frequencyPenalty: 0.5,
  presencePenalty: 0.6,
};

const samplingRequestFields = [
  'temperature',
  'top_p',
  'frequency_penalty',
  'presence_penalty',
] as const;

const expectedWarningFeatures = [
  'temperature',
  'topP',
  'frequencyPenalty',
  'presencePenalty',
];

function parseRequestBody(body: BodyInit | null | undefined) {
  if (typeof body !== 'string') {
    throw new Error('Expected the Moonshot request body to be JSON text.');
  }
  return JSON.parse(body) as Record<string, unknown>;
}

function assertSamplingFieldsOmitted(body: Record<string, unknown>) {
  for (const field of samplingRequestFields) {
    assert.equal(
      field in body,
      false,
      `Expected Kimi request to omit ${field}`,
    );
  }
}

function assertSamplingFieldsRetained(body: Record<string, unknown>) {
  assert.equal(body.temperature, samplingOptions.temperature);
  assert.equal(body.top_p, samplingOptions.topP);
  assert.equal(body.frequency_penalty, samplingOptions.frequencyPenalty);
  assert.equal(body.presence_penalty, samplingOptions.presencePenalty);
}

function assertSamplingWarnings(
  warnings: Array<{ type: string; feature?: string; details?: string }>,
  modelId: string,
) {
  assert.deepEqual(
    warnings.map(warning => warning.feature),
    expectedWarningFeatures,
  );

  for (const warning of warnings) {
    assert.equal(warning.type, 'unsupported');
    assert.match(warning.details ?? '', new RegExp(`"${modelId}"`));
    assert.match(warning.details ?? '', /has been omitted/);
  }
}

async function verifyDirectProviderRejection() {
  const response = await fetch('https://api.moonshot.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.MOONSHOT_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'kimi-k2.6',
      messages: [{ role: 'user', content: 'Reply with OK.' }],
      thinking: { type: 'disabled' },
      max_tokens: 8,
      temperature: samplingOptions.temperature,
      top_p: samplingOptions.topP,
      frequency_penalty: samplingOptions.frequencyPenalty,
      presence_penalty: samplingOptions.presencePenalty,
    }),
  });
  const body = (await response.json()) as {
    error?: { message?: string; type?: string };
  };

  assert.equal(response.status, 400);
  assert.match(body.error?.message ?? '', /invalid temperature/);

  return {
    status: response.status,
    error: body.error,
  };
}

async function verifyLiveSdkRequest() {
  let capturedRequest: Record<string, unknown> | undefined;
  const moonshotai = createMoonshotAI({
    fetch: async (input, init) => {
      capturedRequest = parseRequestBody(init?.body);
      return fetch(input, init);
    },
  });

  const result = await generateText({
    model: moonshotai('kimi-k2.6'),
    prompt: 'Reply with OK.',
    maxOutputTokens: 8,
    ...samplingOptions,
    providerOptions: {
      moonshotai: {
        thinking: { type: 'disabled' },
      },
    },
  });

  assert.ok(capturedRequest);
  assertSamplingFieldsOmitted(capturedRequest);
  assertSamplingWarnings(result.warnings ?? [], 'kimi-k2.6');
  assert.ok(result.text.length > 0, 'Expected the live AI SDK call to succeed');

  return {
    text: result.text,
    requestBody: capturedRequest,
    warnings: result.warnings,
  };
}

async function inspectMockRequest({
  modelId,
  includeSampling,
}: {
  modelId: string;
  includeSampling: boolean;
}) {
  let capturedRequest: Record<string, unknown> | undefined;
  const moonshotai = createMoonshotAI({
    apiKey: 'test-api-key',
    fetch: async (_input, init) => {
      capturedRequest = parseRequestBody(init?.body);
      return new Response(
        JSON.stringify({
          id: 'chatcmpl-issue-19543',
          created: 1787688000,
          model: modelId,
          choices: [
            {
              message: { role: 'assistant', content: 'OK.' },
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
          headers: { 'Content-Type': 'application/json' },
        },
      );
    },
  });

  const result = await generateText({
    model: moonshotai(modelId),
    prompt: 'Reply with OK.',
    ...(includeSampling ? samplingOptions : {}),
  });

  assert.ok(capturedRequest);
  return { requestBody: capturedRequest, warnings: result.warnings };
}

async function verifyModelGating() {
  const kimiModelIds = [
    'kimi-k2.5',
    'kimi-k2.6',
    'kimi-k2.7-code',
    'kimi-k2.7-code-highspeed',
    'kimi-k3',
  ];

  for (const modelId of kimiModelIds) {
    const result = await inspectMockRequest({
      modelId,
      includeSampling: true,
    });
    assertSamplingFieldsOmitted(result.requestBody);
    assertSamplingWarnings(result.warnings ?? [], modelId);
  }

  for (const modelId of ['moonshot-v1-8k', 'custom-model']) {
    const result = await inspectMockRequest({
      modelId,
      includeSampling: true,
    });
    assertSamplingFieldsRetained(result.requestBody);
    assert.deepEqual(result.warnings, []);
  }

  const unaffected = await inspectMockRequest({
    modelId: 'kimi-k2.6',
    includeSampling: false,
  });
  assert.deepEqual(unaffected.requestBody, {
    model: 'kimi-k2.6',
    messages: [{ role: 'user', content: 'Reply with OK.' }],
  });
  assert.deepEqual(unaffected.warnings, []);

  return {
    kimiModelIds,
    passThroughModelIds: ['moonshot-v1-8k', 'custom-model'],
    unaffectedRequest: unaffected.requestBody,
  };
}

async function main() {
  (
    globalThis as typeof globalThis & { AI_SDK_LOG_WARNINGS?: boolean }
  ).AI_SDK_LOG_WARNINGS = false;

  const directProvider = await verifyDirectProviderRejection();
  const liveSdk = await verifyLiveSdkRequest();
  const modelGating = await verifyModelGating();

  console.log(
    JSON.stringify(
      {
        result:
          'Could not reproduce issue #19543: release-v6.0 omits fixed sampling fields for Kimi models and the live AI SDK request succeeds.',
        directProvider,
        liveSdk,
        modelGating,
      },
      null,
      2,
    ),
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
