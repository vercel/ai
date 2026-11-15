#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  HELP,
  loadBenchmarks,
  parseArguments,
  validateBenchmark,
} from './config.mjs';
import { runIteration } from './run-iteration.mjs';
import {
  aggregateRuns,
  formatMiB,
  renderMarkdown,
} from './utils/report.mjs';
import {
  captureRepositoryState,
  formatCommand,
} from './utils/process.mjs';

const toolDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    console.log(HELP);
    return;
  }

  const loaded = await loadBenchmarks(options);
  let benchmarks = loaded.benchmarks;

  if (options.list) {
    for (const benchmark of benchmarks) console.log(benchmark.name);
    return;
  }

  if (options.names.length > 0 && options.command.length === 0) {
    benchmarks = benchmarks.filter(benchmark =>
      options.names.includes(benchmark.name),
    );
    if (benchmarks.length === 0) {
      throw new Error(`No benchmark named ${options.names.join(', ')}`);
    }
  }

  for (const benchmark of benchmarks) validateBenchmark(benchmark);

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputDirectory = path.resolve(
    options.output ?? path.join(toolDirectory, 'results', timestamp),
  );
  await mkdir(outputDirectory, { recursive: true });

  const report = {
    generatedAt: new Date().toISOString(),
    host: {
      platform: process.platform,
      release: os.release(),
      architecture: os.arch(),
      cpu: os.cpus()[0]?.model,
      cpuCount: os.cpus().length,
      totalMemoryBytes: os.totalmem(),
      node: process.version,
    },
    settings: {
      ...loaded.defaults,
      iterations: options.iterations ?? loaded.defaults.iterations,
      sampleIntervalMs:
        options.sampleIntervalMs ?? loaded.defaults.sampleIntervalMs,
    },
    benchmarks: [],
  };

  for (const benchmark of benchmarks) {
    const settings = {
      ...loaded.defaults,
      ...benchmark,
      iterations:
        options.iterations ?? benchmark.iterations ?? loaded.defaults.iterations,
      sampleIntervalMs:
        options.sampleIntervalMs ??
        benchmark.sampleIntervalMs ??
        loaded.defaults.sampleIntervalMs,
      verbose: options.verbose,
    };
    const repository = await captureRepositoryState(benchmark.cwd);
    const runs = [];

    console.log(`\n${benchmark.name}`);
    console.log(`  command: ${formatCommand(benchmark.command)}`);
    console.log(`  cwd: ${benchmark.cwd}`);

    for (let iteration = 1; iteration <= settings.iterations; iteration++) {
      process.stdout.write(`  run ${iteration}/${settings.iterations}... `);
      try {
        const run = await runIteration(
          benchmark,
          settings,
          iteration,
          outputDirectory,
        );
        runs.push(run);
        console.log(
          `${formatMiB(run.peakRssBytes)} peak (${formatMiB(run.peakDeltaRssBytes)} delta)`,
        );
      } catch (error) {
        console.log(`failed: ${error.message}`);
        throw error;
      }
    }

    report.benchmarks.push({
      ...aggregateRuns(benchmark, runs),
      repository,
    });
  }

  await Promise.all([
    writeFile(
      path.join(outputDirectory, 'report.json'),
      `${JSON.stringify(report, null, 2)}\n`,
    ),
    writeFile(
      path.join(outputDirectory, 'report.md'),
      renderMarkdown(report),
    ),
  ]);

  console.log(`\nResults: ${outputDirectory}`);
}

main().catch(error => {
  console.error(`\nMemory benchmark failed: ${error.message}`);
  process.exitCode = 1;
});
