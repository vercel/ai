import { performance } from 'node:perf_hooks';
import { createRunner, getBindingContext, run } from '../dist/index.js';

const iterations = positiveInteger(process.env.RUN_BENCHMARK_ITERATIONS, 100);
const budgets = {
  coldRunMs: 500,
  warmRunP99Ms: 75,
  bindingRoundTripP99Ms: 75,
  tenBindingRoundTripsP99Ms: 100,
  interruptAndReplayP99Ms: 300,
};
const results = {};
const continuationRunner = createRunner({
  continuationSecret: 'run-benchmark-continuation-secret',
});

results.coldRunMs = await measureOnce(() => run({ source: 'return 1;' }));
results.warmRunMs = await measureMany(iterations, () =>
  run({ source: 'return 1;' }),
);
results.bindingRoundTripMs = await measureMany(iterations, () =>
  run({
    source: 'return await tools.echo({ value: 1 });',
    bindings: { tools: { echo: input => input } },
  }),
);
results.tenBindingRoundTripsMs = await measureMany(iterations, () =>
  run({
    source: `
      const values = [];
      for (let index = 0; index < 10; index++) values.push(await tools.echo(index));
      return values;
    `,
    bindings: { tools: { echo: input => input } },
  }),
);
results.interruptAndReplayMs = await measureMany(
  Math.max(10, Math.floor(iterations / 5)),
  async () => {
    const source = 'return await tools.pause();';
    const bindings = {
      tools: {
        pause: () => {
          const context = getBindingContext();
          if (!context.resume) context.interrupt({ kind: 'pause' });
          return context.resume.resolution;
        },
      },
    };
    const interrupted = await continuationRunner.run({ source, bindings });
    if (interrupted.status !== 'interrupted') throw new Error('Expected pause.');
    await continuationRunner.run({
      source,
      bindings,
      continuation: interrupted.continuation,
      resolutions: [
        { interruptionId: interrupted.interruptions[0].id, value: true },
      ],
    });
  },
);

assertBudget('cold run', results.coldRunMs, budgets.coldRunMs);
assertBudget('warm run p99', results.warmRunMs.p99, budgets.warmRunP99Ms);
assertBudget(
  'binding round trip p99',
  results.bindingRoundTripMs.p99,
  budgets.bindingRoundTripP99Ms,
);
assertBudget(
  'ten binding round trips p99',
  results.tenBindingRoundTripsMs.p99,
  budgets.tenBindingRoundTripsP99Ms,
);
assertBudget(
  'interrupt and replay p99',
  results.interruptAndReplayMs.p99,
  budgets.interruptAndReplayP99Ms,
);

process.stdout.write(
  `${JSON.stringify(
    {
      iterations,
      node: process.version,
      platform: `${process.platform}-${process.arch}`,
      memory: process.memoryUsage(),
      budgets,
      results,
    },
    null,
    2,
  )}\n`,
);

async function measureOnce(operation) {
  const start = performance.now();
  await operation();
  return performance.now() - start;
}

async function measureMany(count, operation) {
  const samples = [];
  for (let index = 0; index < count; index++) {
    samples.push(await measureOnce(operation));
  }
  samples.sort((left, right) => left - right);
  return {
    count,
    mean: samples.reduce((sum, value) => sum + value, 0) / samples.length,
    median: percentile(samples, 50),
    p95: percentile(samples, 95),
    p99: percentile(samples, 99),
    max: samples.at(-1),
  };
}

function percentile(values, percentileValue) {
  return values[Math.min(values.length - 1, Math.ceil((percentileValue / 100) * values.length) - 1)];
}

function assertBudget(label, value, budget) {
  if (value > budget) {
    throw new Error(`${label} took ${value}ms; budget is ${budget}ms.`);
  }
}

function positiveInteger(value, fallback) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new TypeError(`Expected a positive integer, received ${value}.`);
  }
  return parsed;
}
