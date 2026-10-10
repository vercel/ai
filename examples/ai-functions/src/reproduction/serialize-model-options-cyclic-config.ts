import assert from 'node:assert/strict';
import { serializeModelOptions } from '@ai-sdk/provider-utils';

type ReproductionConfig = Record<string, unknown> & {
  headers?: () => Record<string, string | undefined>;
};

function reportPrimaryFailure(details: string[]) {
  console.error(
    'BUG REPRODUCED: cyclic nonserializable config prevented model option serialization',
  );
  for (const detail of details) {
    console.error(detail);
  }
  process.exitCode = 1;
}

async function main() {
  const shared = { value: 1 };
  const sharedChildConfig: ReproductionConfig = {
    graph: { left: shared, right: shared },
  };

  assert.deepEqual(
    serializeModelOptions({
      modelId: 'mock',
      config: sharedChildConfig,
    }).config.graph,
    { left: shared, right: shared },
    'shared acyclic children should remain serializable',
  );

  const objectCycle: Record<string, unknown> = { name: 'local graph' };
  objectCycle.self = objectCycle;

  const arrayCycle: unknown[] = [];
  arrayCycle.push(arrayCycle);

  const indirectCycleA: Record<string, unknown> = {};
  const indirectCycleB: Record<string, unknown> = {};
  indirectCycleA.next = indirectCycleB;
  indirectCycleB.next = indirectCycleA;

  const failures: string[] = [];

  for (const [name, localGraph] of [
    ['object cycle', objectCycle],
    ['array cycle', arrayCycle],
    ['indirect cycle', indirectCycleA],
  ] as const) {
    let result: ReturnType<typeof serializeModelOptions> | undefined;
    const cyclicConfig: ReproductionConfig = {
      provider: 'mock',
      localGraph,
    };

    try {
      result = serializeModelOptions({
        modelId: 'mock',
        config: cyclicConfig,
      });
    } catch (error) {
      if (error instanceof RangeError) {
        failures.push(
          `${name} threw ${error.name}: ${error.message}; expected the cyclic property to be omitted`,
        );
        continue;
      }
      throw error;
    }

    const expected = {
      modelId: 'mock',
      config: { provider: 'mock' },
    };

    try {
      assert.deepEqual(result, expected);
    } catch {
      failures.push(
        `${name} was not omitted; expected ${JSON.stringify(expected)}`,
      );
    }
  }

  if (failures.length > 0) {
    reportPrimaryFailure(failures);
    return;
  }

  console.log(
    'serializeModelOptions omitted cyclic config and preserved valid model options',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
