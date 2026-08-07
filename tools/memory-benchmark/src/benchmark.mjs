#!/usr/bin/env node

import { spawn, execFile } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import {
  mkdir,
  readFile,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const toolDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

const DEFAULTS = {
  iterations: 5,
  sampleIntervalMs: 100,
  startupTimeoutMs: 120_000,
  timeoutMs: 10 * 60_000,
  baselineDurationMs: 2_000,
  cooldownMs: 2_000,
  terminateGraceMs: 5_000,
};

const HELP = `
Measure the resident memory of an application and its complete process tree.

Config mode:
  node src/benchmark.mjs --config benchmarks.example.json
  node src/benchmark.mjs --config benchmarks.example.json --name scira

Direct command mode:
  node src/benchmark.mjs --name my-app --iterations 5 -- node app.js

Options:
  --config <path>          JSON benchmark configuration
  --name <name>            Run one named benchmark, or name a direct command
  --iterations <count>     Override iteration count
  --sample-interval <ms>   Override sampling interval
  --output <directory>     Results directory
  --list                   List configured benchmarks
  --verbose                Mirror application output to this terminal
  --help                   Show this help
`.trim();

function parseArguments(argv) {
  const options = {
    command: [],
    names: [],
    verbose: false,
    list: false,
  };

  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];

    if (argument === '--') {
      options.command = argv.slice(index + 1);
      break;
    }

    if (argument === '--help' || argument === '-h') {
      options.help = true;
    } else if (argument === '--verbose') {
      options.verbose = true;
    } else if (argument === '--list') {
      options.list = true;
    } else if (
      [
        '--config',
        '--name',
        '--iterations',
        '--sample-interval',
        '--output',
      ].includes(argument)
    ) {
      const value = argv[++index];
      if (value == null) {
        throw new Error(`Missing value for ${argument}`);
      }
      const key = {
        '--config': 'config',
        '--name': 'name',
        '--iterations': 'iterations',
        '--sample-interval': 'sampleIntervalMs',
        '--output': 'output',
      }[argument];
      const parsedValue =
        argument === '--iterations' || argument === '--sample-interval'
          ? parsePositiveInteger(value, argument)
          : value;
      options[key] = parsedValue;
      if (argument === '--name') options.names.push(parsedValue);
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  return options;
}

function parsePositiveInteger(value, option) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${option} must be a positive integer`);
  }
  return parsed;
}

function expandEnvironmentVariables(value) {
  if (typeof value === 'string') {
    return value.replace(/\$\{([^}]+)\}/g, (_, name) => {
      const replacement = process.env[name];
      if (replacement == null) {
        throw new Error(`Environment variable ${name} is not set`);
      }
      return replacement;
    });
  }

  if (Array.isArray(value)) {
    return value.map(expandEnvironmentVariables);
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        expandEnvironmentVariables(nestedValue),
      ]),
    );
  }

  return value;
}

async function loadBenchmarks(options) {
  if (options.command.length > 0) {
    return {
      defaults: DEFAULTS,
      benchmarks: [
        {
          name: options.name ?? path.basename(options.command[0]),
          cwd: process.cwd(),
          command: options.command,
        },
      ],
    };
  }

  if (!options.config) {
    throw new Error('Provide --config <path> or a command after --');
  }

  const configPath = path.resolve(options.config);
  const configDirectory = path.dirname(configPath);
  const parsed = JSON.parse(await readFile(configPath, 'utf8'));

  if (!Array.isArray(parsed.benchmarks) || parsed.benchmarks.length === 0) {
    throw new Error('Configuration must contain a non-empty benchmarks array');
  }

  const selectedBenchmarks =
    options.names.length === 0
      ? parsed.benchmarks
      : parsed.benchmarks.filter(benchmark =>
          options.names.includes(benchmark.name),
        );

  return {
    defaults: {
      ...DEFAULTS,
      ...expandEnvironmentVariables(parsed.defaults),
    },
    benchmarks: selectedBenchmarks.map(unexpandedBenchmark => {
      const benchmark = expandEnvironmentVariables(unexpandedBenchmark);
      return {
        ...benchmark,
        cwd: path.resolve(configDirectory, benchmark.cwd ?? '.'),
      };
    }),
  };
}

function validateBenchmark(benchmark) {
  if (!benchmark.name || typeof benchmark.name !== 'string') {
    throw new Error('Every benchmark needs a string name');
  }
  if (
    !(
      typeof benchmark.command === 'string' ||
      (Array.isArray(benchmark.command) && benchmark.command.length > 0)
    )
  ) {
    throw new Error(`${benchmark.name}: command must be a string or array`);
  }
  if (
    benchmark.workloadCommand != null &&
    !(
      typeof benchmark.workloadCommand === 'string' ||
      (Array.isArray(benchmark.workloadCommand) &&
        benchmark.workloadCommand.length > 0)
    )
  ) {
    throw new Error(
      `${benchmark.name}: workloadCommand must be a string or array`,
    );
  }
}

function spawnCommand(command, options = {}) {
  const spawnOptions = {
    cwd: options.cwd,
    env: options.env,
    detached: options.detached ?? process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  };

  if (typeof command === 'string') {
    return spawn(command, {
      ...spawnOptions,
      shell: true,
    });
  }

  return spawn(command[0], command.slice(1), spawnOptions);
}

function formatCommand(command) {
  return Array.isArray(command)
    ? command.map(part => JSON.stringify(part)).join(' ')
    : command;
}

function attachOutput(child, logStream, options) {
  let outputTail = '';
  const readyPattern = options.readyPattern
    ? new RegExp(options.readyPattern)
    : undefined;
  let ready = readyPattern == null;
  let resolveReady;
  const readyPromise = new Promise(resolve => {
    resolveReady = resolve;
    if (ready) resolve();
  });

  const handleChunk = (source, chunk) => {
    const text = chunk.toString();
    logStream.write(`[${source}] ${text}`);
    if (options.verbose) {
      const destination = source === 'stderr' ? process.stderr : process.stdout;
      destination.write(text);
    }

    if (!ready && readyPattern) {
      outputTail = `${outputTail}${text}`.slice(-64 * 1024);
      if (readyPattern.test(outputTail)) {
        ready = true;
        resolveReady();
      }
    }
  };

  child.stdout.on('data', chunk => handleChunk('stdout', chunk));
  child.stderr.on('data', chunk => handleChunk('stderr', chunk));

  return { readyPromise, isReady: () => ready };
}

function waitForExit(child) {
  return new Promise(resolve => {
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
}

function delay(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function listProcesses() {
  if (process.platform === 'win32') {
    throw new Error(
      'Process-tree sampling currently supports macOS and Linux only',
    );
  }

  const { stdout } = await execFileAsync('ps', [
    '-axo',
    'pid=,ppid=,pgid=,rss=,vsz=,command=',
  ]);

  return stdout
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const match = line.match(
        /^(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/,
      );
      if (!match) return undefined;
      return {
        pid: Number(match[1]),
        ppid: Number(match[2]),
        pgid: Number(match[3]),
        rssBytes: Number(match[4]) * 1024,
        vszBytes: Number(match[5]) * 1024,
        command: match[6],
      };
    })
    .filter(Boolean);
}

function getProcessTree(processes, rootPid) {
  const inTree = new Set([rootPid]);
  let changed = true;

  while (changed) {
    changed = false;
    for (const processInfo of processes) {
      if (
        !inTree.has(processInfo.pid) &&
        inTree.has(processInfo.ppid)
      ) {
        inTree.add(processInfo.pid);
        changed = true;
      }
    }
  }

  return processes.filter(
    processInfo =>
      processInfo.pgid === rootPid || inTree.has(processInfo.pid),
  );
}

async function terminateProcessGroup(child, graceMs) {
  if (child.exitCode != null || child.signalCode != null) return;

  const sendSignal = signal => {
    try {
      if (process.platform === 'win32') {
        child.kill(signal);
      } else {
        process.kill(-child.pid, signal);
      }
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  };

  sendSignal('SIGTERM');
  const deadline = Date.now() + graceMs;
  while (
    child.exitCode == null &&
    child.signalCode == null &&
    Date.now() < deadline
  ) {
    await delay(50);
  }
  if (child.exitCode == null && child.signalCode == null) sendSignal('SIGKILL');
}

async function runWorkload(command, benchmark, runDirectory, verbose) {
  const logStream = createWriteStream(
    path.join(runDirectory, 'workload.log'),
    { flags: 'a' },
  );
  const child = spawnCommand(command, {
    cwd: benchmark.cwd,
    env: { ...process.env, ...benchmark.env },
    detached: false,
  });
  attachOutput(child, logStream, { verbose });
  const result = await waitForExit(child);
  logStream.end();
  if (result.code !== 0) {
    throw new Error(
      `Workload exited with code ${result.code ?? 'null'} (${result.signal ?? 'no signal'})`,
    );
  }
}

function percentile(values, percentage) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.ceil((percentage / 100) * sorted.length) - 1,
  );
  return sorted[Math.max(0, index)];
}

function mean(values) {
  return values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function summarizeSamples(samples, markers) {
  const rssValues = samples.map(sample => sample.rssBytes);
  const vszValues = samples.map(sample => sample.vszBytes);
  const baselineSamples = samples.filter(
    sample => sample.phase === 'baseline',
  );
  const cooldownSamples = samples.filter(
    sample => sample.phase === 'cooldown',
  );
  const hasWorkload = markers.workloadStartedAt != null;
  const baselineRssBytes = hasWorkload
    ? median(baselineSamples.map(sample => sample.rssBytes))
    : null;
  const postRunRssBytes =
    hasWorkload
      ? (
          cooldownSamples.filter(sample => sample.processCount > 0).at(-1) ??
          samples.filter(sample => sample.processCount > 0).at(-1)
        )?.rssBytes ?? null
      : null;
  const peakRssBytes = Math.max(0, ...rssValues);
  const peakSample = samples.find(sample => sample.rssBytes === peakRssBytes);

  return {
    durationMs: markers.finishedAt - markers.startedAt,
    sampleCount: samples.length,
    baselineRssBytes,
    peakRssBytes,
    peakDeltaRssBytes:
      baselineRssBytes == null ? null : peakRssBytes - baselineRssBytes,
    postRunRssBytes,
    retainedDeltaRssBytes:
      postRunRssBytes == null || baselineRssBytes == null
        ? null
        : postRunRssBytes - baselineRssBytes,
    meanRssBytes: mean(rssValues),
    p50RssBytes: percentile(rssValues, 50),
    p95RssBytes: percentile(rssValues, 95),
    peakVszBytes: Math.max(0, ...vszValues),
    peakProcessCount: Math.max(
      0,
      ...samples.map(sample => sample.processCount),
    ),
    peakProcesses: peakSample?.processes ?? [],
    markers,
  };
}

function samplePhase(markers, elapsedMs) {
  if (markers.workloadStartedAt != null) {
    if (elapsedMs < markers.workloadStartedAt) return 'baseline';
    if (
      markers.workloadFinishedAt == null ||
      elapsedMs < markers.workloadFinishedAt
    ) {
      return 'workload';
    }
    return 'cooldown';
  }
  return 'run';
}

async function captureRepositoryState(cwd) {
  try {
    const [{ stdout: commit }, { stdout: status }] = await Promise.all([
      execFileAsync('git', ['-C', cwd, 'rev-parse', 'HEAD']),
      execFileAsync('git', ['-C', cwd, 'status', '--porcelain']),
    ]);
    return {
      commit: commit.trim(),
      dirty: status.trim().length > 0,
    };
  } catch {
    return undefined;
  }
}

async function runIteration(benchmark, settings, iteration, outputDirectory) {
  const runDirectory = path.join(
    outputDirectory,
    benchmark.name,
    `run-${String(iteration).padStart(2, '0')}`,
  );
  await mkdir(runDirectory, { recursive: true });

  const appLog = createWriteStream(path.join(runDirectory, 'application.log'));
  const environment = { ...process.env, ...benchmark.env };
  const child = spawnCommand(benchmark.command, {
    cwd: benchmark.cwd,
    env: environment,
  });
  const exitPromise = waitForExit(child);
  const output = attachOutput(child, appLog, {
    readyPattern: benchmark.readyPattern,
    verbose: settings.verbose,
  });

  const startedAtAbsolute = Date.now();
  const markers = {
    startedAt: 0,
    readyAt: undefined,
    workloadStartedAt: undefined,
    workloadFinishedAt: undefined,
    finishedAt: undefined,
  };
  const samples = [];
  let sampling = true;
  let samplingError;

  const elapsed = () => Date.now() - startedAtAbsolute;
  const sample = async () => {
    try {
      const processes = getProcessTree(await listProcesses(), child.pid);
      const now = elapsed();
      samples.push({
        elapsedMs: now,
        phase: samplePhase(markers, now),
        rssBytes: processes.reduce(
          (sum, processInfo) => sum + processInfo.rssBytes,
          0,
        ),
        vszBytes: processes.reduce(
          (sum, processInfo) => sum + processInfo.vszBytes,
          0,
        ),
        processCount: processes.length,
        processes,
      });
    } catch (error) {
      samplingError ??= error;
    }
  };

  const sampler = (async () => {
    while (sampling) {
      await sample();
      await delay(settings.sampleIntervalMs);
    }
  })();

  const timeoutPromise = new Promise((_, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timed out after ${settings.timeoutMs} ms`)),
      settings.timeoutMs,
    );
    timer.unref();
  });

  let exitResult;
  let runError;
  try {
    const workflow = async () => {
      if (benchmark.readyPattern) {
        const startupTimeout = delay(settings.startupTimeoutMs).then(() => {
          throw new Error(
            `Ready pattern was not seen within ${settings.startupTimeoutMs} ms`,
          );
        });
        const exitedBeforeReady = exitPromise.then(result => {
          throw new Error(
            `Application exited before ready (code ${result.code ?? 'null'}, signal ${result.signal ?? 'none'})`,
          );
        });
        await Promise.race([
          output.readyPromise,
          startupTimeout,
          exitedBeforeReady,
        ]);
      }
      markers.readyAt = elapsed();

      if (benchmark.workloadCommand) {
        await delay(settings.baselineDurationMs);
        markers.workloadStartedAt = elapsed();
        await runWorkload(
          benchmark.workloadCommand,
          benchmark,
          runDirectory,
          settings.verbose,
        );
        markers.workloadFinishedAt = elapsed();
        await delay(settings.cooldownMs);
        await terminateProcessGroup(child, settings.terminateGraceMs);
      } else if (benchmark.durationMs) {
        await delay(benchmark.durationMs);
        await terminateProcessGroup(child, settings.terminateGraceMs);
      } else {
        exitResult = await exitPromise;
      }
    };

    await Promise.race([workflow(), timeoutPromise]);
  } catch (error) {
    runError = error;
    await terminateProcessGroup(child, settings.terminateGraceMs);
  } finally {
    exitResult ??= await Promise.race([
      exitPromise,
      delay(settings.terminateGraceMs).then(() => ({
        code: null,
        signal: 'unknown',
      })),
    ]);
    await sample();
    markers.finishedAt = elapsed();
    sampling = false;
    await sampler;
    appLog.end();
  }

  if (samplingError) {
    throw samplingError;
  }

  for (const memorySample of samples) {
    memorySample.phase = samplePhase(markers, memorySample.elapsedMs);
  }

  const summary = {
    benchmark: benchmark.name,
    iteration,
    command: formatCommand(benchmark.command),
    workloadCommand: benchmark.workloadCommand
      ? formatCommand(benchmark.workloadCommand)
      : undefined,
    cwd: benchmark.cwd,
    tags: benchmark.tags ?? [],
    notes: benchmark.notes,
    exit: exitResult,
    error: runError?.message,
    ...summarizeSamples(samples, markers),
  };

  const csv = [
    'elapsed_ms,phase,rss_bytes,vsz_bytes,process_count',
    ...samples.map(sample =>
      [
        sample.elapsedMs,
        sample.phase,
        sample.rssBytes,
        sample.vszBytes,
        sample.processCount,
      ].join(','),
    ),
  ].join('\n');

  await Promise.all([
    writeFile(path.join(runDirectory, 'samples.csv'), `${csv}\n`),
    writeFile(
      path.join(runDirectory, 'summary.json'),
      `${JSON.stringify(summary, null, 2)}\n`,
    ),
  ]);

  if (runError) throw runError;
  if (!benchmark.workloadCommand && !benchmark.durationMs && exitResult.code !== 0) {
    throw new Error(
      `Application exited with code ${exitResult.code ?? 'null'} (${exitResult.signal ?? 'no signal'})`,
    );
  }

  return summary;
}

function aggregateRuns(benchmark, runs) {
  const metrics = [
    'baselineRssBytes',
    'peakRssBytes',
    'peakDeltaRssBytes',
    'postRunRssBytes',
    'retainedDeltaRssBytes',
    'meanRssBytes',
    'p95RssBytes',
    'durationMs',
    'peakProcessCount',
  ];

  return {
    name: benchmark.name,
    cwd: benchmark.cwd,
    command: formatCommand(benchmark.command),
    workloadCommand: benchmark.workloadCommand
      ? formatCommand(benchmark.workloadCommand)
      : undefined,
    tags: benchmark.tags ?? [],
    notes: benchmark.notes,
    successfulRuns: runs.length,
    metrics: Object.fromEntries(
      metrics.map(metric => {
        const values = runs
          .map(run => run[metric])
          .filter(value => Number.isFinite(value));
        return [
          metric,
          values.length === 0
            ? { median: null, min: null, max: null, p95: null }
            : {
                median: median(values),
                min: Math.min(...values),
                max: Math.max(...values),
                p95: percentile(values, 95),
              },
        ];
      }),
    ),
  };
}

function formatMiB(bytes) {
  if (bytes == null) return 'n/a';
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

function renderMarkdown(report) {
  const lines = [
    '# AI SDK application memory baseline',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    '| Benchmark | Runs | Baseline RSS | Peak RSS | Peak delta | Post-run RSS | Retained delta |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: |',
  ];

  for (const benchmark of report.benchmarks) {
    const metric = benchmark.metrics;
    lines.push(
      `| ${benchmark.name} | ${benchmark.successfulRuns} | ${formatMiB(metric.baselineRssBytes.median)} | ${formatMiB(metric.peakRssBytes.median)} | ${formatMiB(metric.peakDeltaRssBytes.median)} | ${formatMiB(metric.postRunRssBytes.median)} | ${formatMiB(metric.retainedDeltaRssBytes.median)} |`,
    );
  }

  lines.push(
    '',
    'RSS is the sum of resident memory for every process in the application process group.',
    'Values are medians across successful runs. Raw time series and per-run summaries are stored beside this report.',
    '',
  );
  return lines.join('\n');
}

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
