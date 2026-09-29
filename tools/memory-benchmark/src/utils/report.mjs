import { formatCommand } from './process.mjs';
import { median, percentile } from './statistics.mjs';

export function aggregateRuns(benchmark, runs) {
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

export function formatMiB(bytes) {
  if (bytes == null) return 'n/a';
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

export function renderMarkdown(report) {
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
