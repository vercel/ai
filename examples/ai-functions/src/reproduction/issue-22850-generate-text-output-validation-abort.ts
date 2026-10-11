import { generateText, jsonSchema, Output } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';

async function main() {
  let releaseValidation!: () => void;
  let validationStarted!: () => void;

  const validationGate = new Promise<void>(resolve => {
    releaseValidation = resolve;
  });
  const validationBegan = new Promise<void>(resolve => {
    validationStarted = resolve;
  });

  const schema = jsonSchema(
    { type: 'object' },
    {
      validate: async value => {
        validationStarted();
        await validationGate;
        return { success: true, value };
      },
    },
  );

  const model = new MockLanguageModelV4({
    doGenerate: {
      content: [{ type: 'text', text: '{}' }],
      warnings: [],
      finishReason: { unified: 'stop', raw: 'stop' },
      usage: {
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
      },
    },
  });

  const controller = new AbortController();
  const abortReason = new Error('user cancelled');
  let settled = false;
  let outcome = 'pending';

  const request = generateText({
    model,
    prompt: 'test',
    output: Output.object({ schema }),
    abortSignal: controller.signal,
  }).then(
    () => {
      settled = true;
      outcome = 'resolved';
    },
    error => {
      settled = true;
      outcome =
        error === abortReason
          ? 'original abort'
          : error instanceof Error
            ? error.name
            : typeof error;
    },
  );

  await validationBegan;
  controller.abort(abortReason);
  await new Promise<void>(resolve => setImmediate(resolve));

  const settledBeforeRelease = settled;

  releaseValidation();
  await request;

  if (!settledBeforeRelease || outcome !== 'original abort') {
    console.error(
      'ISSUE_22850_REPRODUCED: generateText did not promptly reject with the original abort reason during async output validation',
    );
    console.error({ settledBeforeRelease, outcome });
    process.exitCode = 1;
    return;
  }

  console.log(
    'Issue not reproduced: generateText promptly rejected with the original abort reason.',
  );
}

await main();
