import { uncoveredCapabilities, type Entry } from './audit';
import { languageProbes } from './language-probes';
import { mediaProbes } from './media-probes';
import { realtimeProbes } from './realtime-probes';

export async function allProbes(modelId: string, entry: Entry) {
  const probes = [
    ...(await languageProbes(modelId, entry)),
    ...mediaProbes(modelId, entry),
    ...realtimeProbes(modelId, entry),
  ];
  const missing = uncoveredCapabilities(
    entry,
    new Set(probes.flatMap(probe => [...probe.covers])),
  );
  if (missing.length)
    throw new Error(
      `Missing capability probes for ${modelId}: ${missing.map(([path]) => path).join(', ')}`,
    );
  return probes;
}
