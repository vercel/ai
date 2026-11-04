import { createWriteStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  attachOutput,
  delay,
  formatCommand,
  getProcessTree,
  listProcesses,
  spawnCommand,
  terminateProcessGroup,
  waitForExit,
} from './utils/process.mjs';
import { summarizeSamples } from './utils/statistics.mjs';

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

export async function runIteration(
  benchmark,
  settings,
  iteration,
  outputDirectory,
) {
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
