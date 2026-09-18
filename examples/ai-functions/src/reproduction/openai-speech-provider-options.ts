import { createOpenAI, type OpenAISpeechModelOptions } from '@ai-sdk/openai';
import { generateSpeech } from 'ai';

const modelId = 'gpt-4o-mini-tts';
const text = 'Synthetic greeting.';

type RequestBody = Record<string, unknown>;

function createCapturingProvider() {
  const requestBodies: RequestBody[] = [];

  const provider = createOpenAI({
    apiKey: 'synthetic-not-a-real-key',
    fetch: async (_url, init) => {
      requestBodies.push(JSON.parse(String(init?.body)) as RequestBody);
      return new Response(new Uint8Array(480), {
        headers: { 'content-type': 'audio/mpeg' },
      });
    },
  });

  return {
    model: provider.speech(modelId),
    requestBodies,
  };
}

function matchesExpectedFields(
  body: RequestBody,
  expected: RequestBody,
): boolean {
  return Object.entries(expected).every(([key, value]) => body[key] === value);
}

async function captureGenerateSpeech(options: {
  providerOptions?: { openai: OpenAISpeechModelOptions };
  speed?: number;
  instructions?: string;
}) {
  const { model, requestBodies } = createCapturingProvider();
  const result = await generateSpeech({
    model,
    text,
    ...options,
  });

  return {
    body: requestBodies[0],
    warnings: result.warnings,
  };
}

async function captureDirectGenerate(options: {
  providerOptions?: { openai: OpenAISpeechModelOptions };
  speed?: number;
  instructions?: string;
}) {
  const { model, requestBodies } = createCapturingProvider();
  const result = await model.doGenerate({
    text,
    ...options,
  });

  return {
    body: requestBodies[0],
    warnings: result.warnings,
  };
}

async function main() {
  const primaryFailures: string[] = [];
  const controlFailures: string[] = [];

  const providerCases = [
    {
      name: 'speed',
      providerOptions: {
        openai: { speed: 0.75 } satisfies OpenAISpeechModelOptions,
      },
      expected: { speed: 0.75 },
    },
    {
      name: 'instructions',
      providerOptions: {
        openai: {
          instructions: 'Speak slowly.',
        } satisfies OpenAISpeechModelOptions,
      },
      expected: { instructions: 'Speak slowly.' },
    },
    {
      name: 'speed and instructions',
      providerOptions: {
        openai: {
          speed: 0.75,
          instructions: 'Speak slowly.',
        } satisfies OpenAISpeechModelOptions,
      },
      expected: { speed: 0.75, instructions: 'Speak slowly.' },
    },
  ];

  for (const providerCase of providerCases) {
    const generateResult = await captureGenerateSpeech({
      providerOptions: providerCase.providerOptions,
    });
    if (!matchesExpectedFields(generateResult.body, providerCase.expected)) {
      primaryFailures.push(`generateSpeech ${providerCase.name}`);
    }
    if (generateResult.warnings.length !== 0) {
      controlFailures.push(
        `generateSpeech ${providerCase.name} unexpectedly returned warnings`,
      );
    }

    const directResult = await captureDirectGenerate({
      providerOptions: providerCase.providerOptions,
    });
    if (!matchesExpectedFields(directResult.body, providerCase.expected)) {
      primaryFailures.push(`doGenerate ${providerCase.name}`);
    }
    if (directResult.warnings.length !== 0) {
      controlFailures.push(
        `doGenerate ${providerCase.name} unexpectedly returned warnings`,
      );
    }
  }

  for (const [name, capture] of [
    ['generateSpeech', captureGenerateSpeech],
    ['doGenerate', captureDirectGenerate],
  ] as const) {
    const defaultResult = await capture({});
    if ('speed' in defaultResult.body || 'instructions' in defaultResult.body) {
      controlFailures.push(`${name} default request added speech options`);
    }

    const topLevelResult = await capture({
      speed: 1.25,
      instructions: 'Speak brightly.',
    });
    if (
      !matchesExpectedFields(topLevelResult.body, {
        speed: 1.25,
        instructions: 'Speak brightly.',
      })
    ) {
      controlFailures.push(`${name} top-level speech options were not sent`);
    }
  }

  for (const [name, invoke] of [
    [
      'generateSpeech',
      async () => {
        const { model, requestBodies } = createCapturingProvider();
        let rejected = false;
        try {
          await generateSpeech({
            model,
            text,
            providerOptions: { openai: { speed: 0.1 } },
          });
        } catch {
          rejected = true;
        }
        return { rejected, requestCount: requestBodies.length };
      },
    ],
    [
      'doGenerate',
      async () => {
        const { model, requestBodies } = createCapturingProvider();
        let rejected = false;
        try {
          await model.doGenerate({
            text,
            providerOptions: { openai: { speed: 0.1 } },
          });
        } catch {
          rejected = true;
        }
        return { rejected, requestCount: requestBodies.length };
      },
    ],
  ] as const) {
    const invalidResult = await invoke();
    if (!invalidResult.rejected || invalidResult.requestCount !== 0) {
      controlFailures.push(
        `${name} did not reject invalid provider speed before fetch`,
      );
    }
  }

  if (controlFailures.length > 0) {
    console.error(
      `Reproduction control failure: ${controlFailures.join('; ')}`,
    );
    process.exitCode = 2;
    return;
  }

  if (primaryFailures.length > 0) {
    console.error(
      'ISSUE #21071 REPRODUCED: providerOptions.openai.speed and instructions were omitted from OpenAI speech request bodies',
    );
    console.error(`Affected cases: ${primaryFailures.join(', ')}`);
    process.exitCode = 1;
    return;
  }

  console.log(
    'OpenAI speech provider options were included in all request bodies.',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 2;
});
