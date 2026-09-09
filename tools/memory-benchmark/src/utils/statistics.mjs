export function percentile(values, percentage) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.ceil((percentage / 100) * sorted.length) - 1,
  );
  return sorted[Math.max(0, index)];
}

export function mean(values) {
  return values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

export function summarizeSamples(samples, markers) {
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
