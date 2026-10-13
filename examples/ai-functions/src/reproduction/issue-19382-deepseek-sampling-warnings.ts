import assert from 'node:assert/strict';
import { createDeepSeek } from '../../../../packages/deepseek/dist/index.mjs';

type RequestRecord = {
  body: Record<string, unknown>;
};

const requests: RequestRecord[] = [];

const deepseek = createDeepSeek({
  fetch: async (input, init) => {
    assert.equal(typeof init?.body, 'string');
    requests.push({ body: JSON.parse(init.body) });
    return fetch(input, init);
  },
});

const prompt = [
  {
    role: 'user' as const,
    content: [{ type: 'text' as const, text: 'Reply with OK.' }],
  },
];

const samplingOptions = {
  prompt,
  maxOutputTokens: 16,
  temperature: 0.2,
  topP: 0.4,
  frequencyPenalty: 0.5,
  presencePenalty: 0.6,
};

const penaltyWarningMessages = [
  'frequencyPenalty is deprecated by DeepSeek and has been omitted. Remove frequencyPenalty from the request.',
  'presencePenalty is deprecated by DeepSeek and has been omitted. Remove presencePenalty from the request.',
];

function assertPenaltiesOmitted(
  body: Record<string, unknown>,
  warnings: Array<Record<string, unknown>>,
) {
  assert.equal('frequency_penalty' in body, false);
  assert.equal('presence_penalty' in body, false);

  const messages = warnings
    .map(warning => warning.message)
    .filter((message): message is string => typeof message === 'string');

  for (const message of penaltyWarningMessages) {
    assert.ok(messages.includes(message), `missing warning: ${message}`);
  }
}

function assertDefaultThinkingSamplingHandled(
  body: Record<string, unknown>,
  warnings: Array<Record<string, unknown>>,
) {
  assertPenaltiesOmitted(body, warnings);
  assert.equal('temperature' in body, false);
  assert.equal('top_p' in body, false);
  assert.ok(
    warnings.some(
      warning =>
        warning.type === 'unsupported-setting' &&
        warning.setting === 'temperature',
    ),
    'missing unsupported temperature warning',
  );
  assert.ok(
    warnings.some(
      warning =>
        warning.type === 'unsupported-setting' && warning.setting === 'topP',
    ),
    'missing unsupported topP warning',
  );
}

function assertDisabledThinkingSamplingHandled(
  body: Record<string, unknown>,
  warnings: Array<Record<string, unknown>>,
) {
  assertPenaltiesOmitted(body, warnings);
  assert.equal(body.temperature, 0.2);
  assert.equal(body.top_p, 0.4);
  assert.deepEqual(body.thinking, { type: 'disabled' });
  assert.equal(
    warnings.some(
      warning =>
        warning.type === 'unsupported-setting' &&
        (warning.setting === 'temperature' || warning.setting === 'topP'),
    ),
    false,
  );
}

async function runGenerate(thinkingDisabled: boolean) {
  const requestIndex = requests.length;
  const result = await deepseek('deepseek-v4-flash').doGenerate({
    ...samplingOptions,
    ...(thinkingDisabled
      ? {
          providerOptions: {
            deepseek: { thinking: { type: 'disabled' } },
          },
        }
      : {}),
  });
  const body = requests[requestIndex]?.body;
  assert.ok(body, 'generate request body was not captured');

  if (thinkingDisabled) {
    assertDisabledThinkingSamplingHandled(body, result.warnings);
  } else {
    assertDefaultThinkingSamplingHandled(body, result.warnings);
  }
}

async function runStream(thinkingDisabled: boolean) {
  const requestIndex = requests.length;
  const result = await deepseek('deepseek-v4-flash').doStream({
    ...samplingOptions,
    ...(thinkingDisabled
      ? {
          providerOptions: {
            deepseek: { thinking: { type: 'disabled' } },
          },
        }
      : {}),
  });

  let warnings: Array<Record<string, unknown>> | undefined;
  const errors: unknown[] = [];
  for await (const part of result.stream) {
    if (part.type === 'stream-start') {
      warnings = part.warnings;
    } else if (part.type === 'error') {
      errors.push(part.error);
    }
  }

  assert.deepEqual(errors, []);
  assert.ok(warnings, 'stream-start warnings were not emitted');
  const body = requests[requestIndex]?.body;
  assert.ok(body, 'stream request body was not captured');

  if (thinkingDisabled) {
    assertDisabledThinkingSamplingHandled(body, warnings);
  } else {
    assertDefaultThinkingSamplingHandled(body, warnings);
  }
}

async function main() {
  await runGenerate(false);
  await runStream(false);
  await runGenerate(true);
  await runStream(true);
  console.log(
    'Issue #19382 did not reproduce: generate and stream omitted deprecated penalties with warnings, omitted ineffective default-thinking sampling with warnings, and preserved temperature/topP when thinking was disabled.',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
