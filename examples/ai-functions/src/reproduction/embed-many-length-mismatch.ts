import { embed, embedMany, InvalidResponseDataError } from 'ai';
import { MockEmbeddingModelV4 } from 'ai/test';

type Scenario = {
  name: string;
  values: string[];
  maxEmbeddingsPerCall: number;
  createEmbeddings: (values: string[]) => number[][];
};

const scenarios: Scenario[] = [
  {
    name: 'fast path, empty response',
    values: ['alpha', 'beta'],
    maxEmbeddingsPerCall: Infinity,
    createEmbeddings: () => [],
  },
  {
    name: 'fast path, truncated response',
    values: ['alpha', 'beta'],
    maxEmbeddingsPerCall: Infinity,
    createEmbeddings: values =>
      values.slice(0, -1).map(value => [value.length]),
  },
  {
    name: 'chunked path, empty responses',
    values: ['alpha', 'beta', 'gamma', 'delta'],
    maxEmbeddingsPerCall: 2,
    createEmbeddings: () => [],
  },
  {
    name: 'chunked path, truncated responses',
    values: ['alpha', 'beta', 'gamma', 'delta'],
    maxEmbeddingsPerCall: 2,
    createEmbeddings: values =>
      values.slice(0, -1).map(value => [value.length]),
  },
];

async function observeEmbedBaseline() {
  const result = await embed({
    model: new MockEmbeddingModelV4({
      doEmbed: async () => ({ embeddings: [], warnings: [] }),
    }),
    value: 'alpha',
    maxRetries: 0,
  });

  console.log(
    `embed() empty-response baseline: embedding=${String(result.embedding)}`,
  );
}

async function runScenario(scenario: Scenario) {
  try {
    const result = await embedMany({
      model: new MockEmbeddingModelV4({
        maxEmbeddingsPerCall: scenario.maxEmbeddingsPerCall,
        doEmbed: async ({ values }) => ({
          embeddings: scenario.createEmbeddings(values),
          warnings: [],
        }),
      }),
      values: scenario.values,
      maxRetries: 0,
    });

    return {
      name: scenario.name,
      valuesLength: result.values.length,
      embeddingsLength: result.embeddings.length,
    };
  } catch (error) {
    if (InvalidResponseDataError.isInstance(error)) {
      return undefined;
    }

    throw new Error(
      `${scenario.name} rejected with ${error instanceof Error ? error.name : typeof error}, expected InvalidResponseDataError`,
      { cause: error },
    );
  }
}

async function main() {
  await observeEmbedBaseline();

  const acceptedMismatches = (
    await Promise.all(scenarios.map(runScenario))
  ).filter(result => result !== undefined);

  if (acceptedMismatches.length > 0) {
    console.error(JSON.stringify(acceptedMismatches, null, 2));
    throw new Error(
      'ISSUE #20359 REPRODUCED: embedMany accepted provider responses whose embedding counts did not match their input counts',
    );
  }

  console.log('All mismatched embedMany responses were rejected.');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
