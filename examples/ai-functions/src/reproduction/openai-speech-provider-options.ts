import { createOpenAI, type OpenAISpeechModelOptions } from '@ai-sdk/openai';
import { experimental_generateSpeech as generateSpeech } from 'ai';

type RequestBody = Record<string, unknown>;

const requestBodies: RequestBody[] = [];

const openai = createOpenAI({
  apiKey: 'synthetic-not-a-real-key',
  fetch: async (_url, init) => {
    requestBodies.push(JSON.parse(String(init?.body)) as RequestBody);
    return new Response(new Uint8Array(480), {
      headers: { 'content-type': 'audio/mpeg' },
    });
  },
});

const model = openai.speech('gpt-4o-mini-tts');

async function captureGenerateSpeechRequest(options?: {
  providerOptions?: OpenAISpeechModelOptions;
  speed?: number;
  instructions?: string;
}) {
  const callIndex = requestBodies.length;
  const result = await generateSpeech({
    model,
    text: 'Synthetic greeting.',
    speed: options?.speed,
    instructions: options?.instructions,
    providerOptions: options?.providerOptions
      ? { openai: options.providerOptions }
      : undefined,
  });

  return {
    body: requestBodies[callIndex],
    warnings: result.warnings,
  };
}

async function captureDirectRequest(options?: {
  providerOptions?: OpenAISpeechModelOptions;
  speed?: number;
  instructions?: string;
}) {
  const callIndex = requestBodies.length;
  const result = await model.doGenerate({
    text: 'Synthetic greeting.',
    speed: options?.speed,
    instructions: options?.instructions,
    providerOptions: options?.providerOptions
      ? { openai: options.providerOptions }
      : undefined,
  });

  return {
    body: requestBodies[callIndex],
    warnings: result.warnings,
  };
}

function assertControl(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(`ISSUE_21071_CONTROL_FAILURE: ${message}`);
  }
}

async function assertInvalidSpeedRejectedBeforeFetch(
  invoke: () => Promise<unknown>,
  label: string,
) {
  const callCountBefore = requestBodies.length;
  let rejected = false;

  try {
    await invoke();
  } catch {
    rejected = true;
  }

  assertControl(rejected, `${label} accepted an invalid provider speed`);
  assertControl(
    requestBodies.length === callCountBefore,
    `${label} called fetch for an invalid provider speed`,
  );
}

async function main() {
  const failures: string[] = [];
  const providerOptionCases = [
    {
      name: 'speed',
      options: { speed: 0.75 },
      expected: { speed: 0.75 },
    },
    {
      name: 'instructions',
      options: { instructions: 'Speak slowly.' },
      expected: { instructions: 'Speak slowly.' },
    },
    {
      name: 'speed and instructions',
      options: { speed: 0.75, instructions: 'Speak slowly.' },
      expected: { speed: 0.75, instructions: 'Speak slowly.' },
    },
  ] satisfies Array<{
    name: string;
    options: OpenAISpeechModelOptions;
    expected: OpenAISpeechModelOptions;
  }>;

  for (const api of [
    {
      name: 'generateSpeech',
      capture: captureGenerateSpeechRequest,
    },
    {
      name: 'doGenerate',
      capture: captureDirectRequest,
    },
  ]) {
    for (const testCase of providerOptionCases) {
      const result = await api.capture({
        providerOptions: testCase.options,
      });

      assertControl(
        result.warnings.length === 0,
        `${api.name} returned warnings for valid provider options`,
      );

      for (const [key, expectedValue] of Object.entries(testCase.expected)) {
        if (result.body[key] !== expectedValue) {
          failures.push(`${api.name}: ${testCase.name}`);
          break;
        }
      }
    }
  }

  for (const api of [
    {
      name: 'generateSpeech',
      capture: captureGenerateSpeechRequest,
    },
    {
      name: 'doGenerate',
      capture: captureDirectRequest,
    },
  ]) {
    const defaultResult = await api.capture();
    assertControl(
      !('speed' in defaultResult.body) &&
        !('instructions' in defaultResult.body),
      `${api.name} added unset speech options`,
    );

    const topLevelResult = await api.capture({
      speed: 0.75,
      instructions: 'Speak slowly.',
    });
    assertControl(
      topLevelResult.body.speed === 0.75 &&
        topLevelResult.body.instructions === 'Speak slowly.',
      `${api.name} omitted top-level speech options`,
    );
  }

  await assertInvalidSpeedRejectedBeforeFetch(
    () =>
      captureGenerateSpeechRequest({
        providerOptions: { speed: 5 },
      }),
    'generateSpeech',
  );
  await assertInvalidSpeedRejectedBeforeFetch(
    () =>
      captureDirectRequest({
        providerOptions: { speed: 5 },
      }),
    'doGenerate',
  );

  if (failures.length > 0) {
    console.error(
      `ISSUE_21071_REPRODUCED: ${failures.length} OpenAI speech requests omitted documented provider options`,
    );
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    'ISSUE_21071_FIXED: OpenAI speech requests include documented provider options',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 2;
});
