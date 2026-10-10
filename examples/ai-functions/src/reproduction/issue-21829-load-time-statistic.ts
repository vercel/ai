import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

class ReproducedBugError extends Error {}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

async function main() {
  const repositoryRoot = resolve(process.cwd(), '../..');
  const benchmarkPath = resolve(
    repositoryRoot,
    'examples/ai-functions/src/benchmark/load-time.ts',
  );
  const workflowPath = resolve(repositoryRoot, '.github/workflows/ci.yml');
  const [benchmark, workflow] = await Promise.all([
    readFile(benchmarkPath, 'utf8'),
    readFile(workflowPath, 'utf8'),
  ]);

  const exportedStatistic = benchmark.match(
    /const outputValue = (\w+)\.toFixed\(1\)/,
  )?.[1];
  assert.equal(
    exportedStatistic,
    'median',
    'Benchmark must export the reported median for this scenario',
  );

  const comparisonVariable = workflow.match(
    /if \(\( \$\(echo "\$([A-Z_]+) > \$\{\{ matrix\.max-load-time \}\}"/,
  )?.[1];
  assert.ok(
    comparisonVariable,
    'Could not identify the compared load-time value',
  );

  const assignment = workflow.match(
    new RegExp(`^\\s*${comparisonVariable}=(.+)$`, 'm'),
  )?.[1];
  assert.ok(
    assignment,
    `Could not identify the assignment for ${comparisonVariable}`,
  );

  let comparedStatistic: 'average' | 'median';
  if (/grep "Average:"/.test(assignment)) {
    comparedStatistic = 'average';
  } else if (
    /grep "Median:"/.test(assignment) ||
    /steps\.load-time\.outputs/.test(assignment)
  ) {
    comparedStatistic = 'median';
  } else {
    assert.fail(`Unsupported load-time value assignment: ${assignment}`);
  }

  // One slow process spawn is enough to put the mean over the threshold while
  // the typical import time, represented by the median, remains well below it.
  const measurements = [...Array<number>(49).fill(60), 600];
  const threshold = 70;
  const average =
    measurements.reduce((total, value) => total + value, 0) /
    measurements.length;
  const medianValue = median(measurements);
  const comparedValue = comparedStatistic === 'average' ? average : medianValue;

  assert.ok(
    medianValue <= threshold,
    'Synthetic benchmark median must remain within the threshold',
  );
  assert.ok(
    average > threshold,
    'Synthetic benchmark average must exceed the threshold',
  );

  const iterations = Number(benchmark.match(/const iterations = (\d+)/)?.[1]);
  const loggedIterations = Number(
    benchmark.match(/Running import benchmark (\d+) times/)?.[1],
  );
  assert.ok(
    Number.isFinite(iterations) && Number.isFinite(loggedIterations),
    'Could not identify the configured and logged iteration counts',
  );
  if (iterations !== loggedIterations) {
    console.log(
      `Secondary mismatch: benchmark runs ${iterations} iterations but logs ${loggedIterations}.`,
    );
  }

  console.log(
    `Synthetic measurements: median=${medianValue.toFixed(1)}ms, average=${average.toFixed(1)}ms, threshold=${threshold}ms.`,
  );
  console.log(
    `The workflow compares the ${comparedStatistic} (${comparedValue.toFixed(1)}ms).`,
  );

  if (medianValue <= threshold && comparedValue > threshold) {
    throw new ReproducedBugError(
      'ISSUE_21829: load-time check fails even though the exported median is within the threshold',
    );
  }

  console.log('Issue #21829 did not reproduce.');
}

main().catch(error => {
  if (error instanceof ReproducedBugError) {
    console.error(error.message);
    process.exitCode = 1;
    return;
  }

  console.error('REPRODUCTION_HARNESS_ERROR', error);
  process.exitCode = 2;
});
