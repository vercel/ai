import { monitorEventLoopDelay } from 'node:perf_hooks';
import { createRunner, getBindingContext, run } from '../dist/index.js';
import { getRuntimeDiagnostics } from '../dist/runtime/manager.js';

const iterations = positiveInteger(
  process.env.RUN_HARDENING_SOAK_ITERATIONS,
  10_000,
);
const maxRssGrowthBytes = positiveInteger(
  process.env.RUN_HARDENING_MAX_RSS_GROWTH_BYTES,
  256 * 1024 * 1024,
);
const eventLoop = monitorEventLoopDelay({ resolution: 20 });
const continuationRunner = createRunner({
  continuationSecret: 'run-hardening-soak-continuation-secret',
});
eventLoop.enable();

for (let index = 0; index < 100; index++) {
  await run({ source: 'return 1;' });
}
globalThis.gc?.();
const baseline = memory();
const counts = {
  completed: 0,
  guestErrors: 0,
  bindingErrors: 0,
  interruptions: 0,
  aborts: 0,
  timeouts: 0,
};
const startedAt = performance.now();

for (let index = 0; index < iterations; index++) {
  const kind = index % 20;
  if (kind < 10) {
    const result = await run({ source: `return ${index};` });
    assertCompleted(result, index);
    counts.completed++;
  } else if (kind < 14) {
    const result = await run({
      source: 'return await tools.echo({ value: 1 });',
      bindings: { tools: { echo: input => input } },
    });
    assertCompleted(result, { value: 1 });
    counts.completed++;
  } else if (kind === 14) {
    let rejected = false;
    try {
      await run({ source: "throw new Error('expected');" });
    } catch (error) {
      if (error?.code !== 'RUN_ERROR') throw error;
      rejected = true;
      counts.guestErrors++;
    }
    if (!rejected) throw new Error('Expected guest error.');
  } else if (kind === 15) {
    let rejected = false;
    try {
      await run({
        source: 'return await tools.fail();',
        bindings: { tools: { fail: () => Promise.reject(new Error('expected')) } },
      });
    } catch (error) {
      if (error?.code !== 'RUN_HOST_BINDING_ERROR') throw error;
      rejected = true;
      counts.bindingErrors++;
    }
    if (!rejected) throw new Error('Expected binding error.');
  } else if (kind < 18) {
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
    if (interrupted.status !== 'interrupted') {
      throw new Error('Expected interruption.');
    }
    const completed = await continuationRunner.run({
      source,
      bindings,
      continuation: interrupted.continuation,
      resolutions: [
        { interruptionId: interrupted.interruptions[0].id, value: true },
      ],
    });
    assertCompleted(completed, true);
    counts.interruptions++;
  } else if (kind === 18) {
    const controller = new AbortController();
    controller.abort();
    try {
      await run({ source: 'return 1;', abortSignal: controller.signal });
      throw new Error('Expected abort.');
    } catch (error) {
      if (error?.code !== 'RUN_ABORTED') throw error;
      counts.aborts++;
    }
  } else {
    try {
      await run({
        source: 'while (true) {}',
        // Leave enough wall-clock budget for the worker's QuickJS interrupt
        // handler to dispose the context cleanly before the host deadline.
        limits: { timeoutMs: 100 },
      });
      throw new Error('Expected timeout.');
    } catch (error) {
      if (error?.code !== 'RUN_TIMEOUT') throw error;
      counts.timeouts++;
    }
  }

  if (index % 100 === 0) {
    const diagnostics = getRuntimeDiagnostics();
    if (diagnostics.activeInvocations !== 0) {
      throw new Error(`Runtime capacity leaked at iteration ${index}.`);
    }
  }
}

globalThis.gc?.();
const final = memory();
const diagnostics = getRuntimeDiagnostics();
eventLoop.disable();
if (
  diagnostics.activeInvocations !== 0 ||
  diagnostics.destroyedIdleWorkers !== 0 ||
  diagnostics.terminatingWorkers !== 0
) {
  throw new Error(`Runtime lifecycle leak: ${JSON.stringify(diagnostics)}`);
}
if (final.rss - baseline.rss > maxRssGrowthBytes) {
  throw new Error(
    `RSS grew by ${final.rss - baseline.rss} bytes; limit is ${maxRssGrowthBytes}.`,
  );
}

process.stdout.write(
  `${JSON.stringify(
    {
      iterations,
      durationMs: Math.round(performance.now() - startedAt),
      counts,
      baseline,
      final,
      growth: {
        rss: final.rss - baseline.rss,
        heapUsed: final.heapUsed - baseline.heapUsed,
      },
      eventLoopDelayMs: {
        mean: Number(eventLoop.mean / 1e6),
        p99: Number(eventLoop.percentile(99) / 1e6),
        max: Number(eventLoop.max / 1e6),
      },
      diagnostics,
    },
    null,
    2,
  )}\n`,
);

function assertCompleted(result, expected) {
  if (result.status !== 'completed') throw new Error('Unexpected interruption.');
  if (JSON.stringify(result.value) !== JSON.stringify(expected)) {
    throw new Error('Unexpected completed value.');
  }
}

function memory() {
  const usage = process.memoryUsage();
  return { rss: usage.rss, heapUsed: usage.heapUsed };
}

function positiveInteger(value, fallback) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new TypeError(`Expected a positive integer, received ${value}.`);
  }
  return parsed;
}
