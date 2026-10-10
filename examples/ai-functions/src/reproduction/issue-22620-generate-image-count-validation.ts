import type { ImageModelV4 } from '@ai-sdk/provider';
import { generateImage, InvalidArgumentError } from 'ai';

const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

type Scenario = {
  label: string;
  n: number;
  maxImagesPerCall?: number;
  modelMaxImagesPerCall?: number;
};

async function runScenario(scenario: Scenario) {
  const calls: number[] = [];
  const model: ImageModelV4 = {
    specificationVersion: 'v4',
    provider: 'mock',
    modelId: 'mock',
    maxImagesPerCall: scenario.modelMaxImagesPerCall ?? 1,
    async doGenerate({ n }) {
      calls.push(n);
      return {
        images: [png],
        warnings: [],
        response: {
          timestamp: new Date(0),
          modelId: 'mock',
          headers: {},
        },
      };
    },
  };

  let error: unknown;
  try {
    await generateImage({
      model,
      prompt: 'A dot',
      n: scenario.n,
      maxImagesPerCall: scenario.maxImagesPerCall,
      maxRetries: 0,
    });
  } catch (caughtError) {
    error = caughtError;
  }

  return {
    label: scenario.label,
    calls,
    errorName:
      error instanceof Error
        ? error.name
        : error == null
          ? undefined
          : 'unknown',
    isInvalidArgumentError: InvalidArgumentError.isInstance(error),
  };
}

async function main() {
  const invalidScenarios: Scenario[] = [
    { label: 'fractional n', n: 1.5 },
    { label: 'zero n', n: 0 },
    { label: 'negative n', n: -1 },
    { label: 'NaN n', n: Number.NaN },
    { label: 'infinite n', n: Number.POSITIVE_INFINITY },
    { label: 'fractional explicit limit', n: 1, maxImagesPerCall: 0.5 },
    { label: 'zero explicit limit', n: 1, maxImagesPerCall: 0 },
    { label: 'negative explicit limit', n: 1, maxImagesPerCall: -1 },
    { label: 'NaN explicit limit', n: 1, maxImagesPerCall: Number.NaN },
    { label: 'fractional model limit', n: 1, modelMaxImagesPerCall: 0.5 },
  ];

  const invalidResults = await Promise.all(invalidScenarios.map(runScenario));

  const validResults = await Promise.all([
    runScenario({
      label: 'valid evenly divisible count',
      n: 4,
      maxImagesPerCall: 2,
    }),
    runScenario({
      label: 'valid count with remainder',
      n: 5,
      maxImagesPerCall: 2,
    }),
  ]);

  const validCallsMatch =
    JSON.stringify(validResults[0].calls) === JSON.stringify([2, 2]) &&
    JSON.stringify(validResults[1].calls) === JSON.stringify([2, 2, 1]) &&
    validResults.every(result => result.errorName == null);

  if (!validCallsMatch) {
    throw new Error(
      `Reproduction setup failed for valid controls: ${JSON.stringify(validResults)}`,
    );
  }

  console.log(JSON.stringify({ invalidResults, validResults }, null, 2));

  const invalidCountWasNotRejectedBeforeDispatch = invalidResults.some(
    result => result.calls.length !== 0 || !result.isInvalidArgumentError,
  );

  if (invalidCountWasNotRejectedBeforeDispatch) {
    console.error(
      'ISSUE_REPRODUCED: generateImage did not reject invalid image counts before provider dispatch',
    );
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
