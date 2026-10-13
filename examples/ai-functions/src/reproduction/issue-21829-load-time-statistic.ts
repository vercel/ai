import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

function median(values: number[]): number {
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

  const samples = [...Array<number>(49).fill(60), 600];
  const sampleMedian = median(samples);
  const sampleAverage =
    samples.reduce((total, value) => total + value, 0) / samples.length;
  const threshold = 70;

  const comparesAverage =
    workflow.includes('AVERAGE_TIME=$(grep "Average:"') &&
    workflow.includes('"$AVERAGE_TIME > ${{ matrix.max-load-time }}"');
  const comparesMedian =
    (workflow.includes('MEDIAN_TIME=$(grep "Median:"') &&
      workflow.includes('"$MEDIAN_TIME > ${{ matrix.max-load-time }}"')) ||
    workflow.includes('steps.load-time.outputs');

  if (comparesAverage === comparesMedian) {
    throw new Error(
      'Could not uniquely identify the statistic used by the load-time threshold check.',
    );
  }

  const configuredIterations = benchmark.match(
    /const iterations = (\d+);/,
  )?.[1];
  const loggedIterations = benchmark.match(
    /Running import benchmark (\d+) times/,
  )?.[1];
  const exportsMedian = benchmark.includes(
    'const outputValue = median.toFixed(1);',
  );

  console.log(
    `Synthetic 50-run benchmark: median=${sampleMedian.toFixed(1)}ms, average=${sampleAverage.toFixed(1)}ms, threshold=${threshold.toFixed(1)}ms.`,
  );
  console.log(
    `Workflow compares the ${comparesAverage ? 'average' : 'median'}.`,
  );
  console.log(
    `Benchmark exports median: ${exportsMedian}; configured iterations: ${configuredIterations ?? 'unknown'}; literal logged iterations: ${loggedIterations ?? 'dynamic'}.`,
  );

  const expectedFailure = sampleMedian > threshold;
  const actualFailure =
    (comparesAverage ? sampleAverage : sampleMedian) > threshold;

  if (!expectedFailure && actualFailure) {
    console.error(
      'ISSUE 21829 REPRODUCED: load-time check fails on 70.8 ms mean even though 60.0 ms median is within 70.0 ms threshold.',
    );
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 2;
});
