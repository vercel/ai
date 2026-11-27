import { openaiModelCatalog } from '@ai-sdk/openai/internal';
import { parseArgs } from 'node:util';
import { run } from '../../lib/run';
import {
  capabilityLabels,
  capabilityCells,
  display,
  uncoveredCapabilities,
  type Reporter,
} from './audit';
import { checkDocs } from './check-docs';
import { checkLive } from './check-live';
import { allProbes } from './probes';

const { values } = parseArgs({
  options: {
    live: { type: 'boolean', default: false },
    model: { type: 'string', multiple: true },
    probe: { type: 'string' },
  },
});
const counts = { MATCH: 0, MISMATCH: 0, UNVERIFIED: 0, MISSING: 0 };
globalThis.AI_SDK_LOG_WARNINGS = false;
const report: Reporter = (status, modelId, check, detail) => {
  counts[status]++;
  console.log(`${status.padEnd(10)} ${modelId} ${check}: ${detail}`);
};

// run() logs unexpected setup errors; preserve a failing exit code for those too.
process.exitCode = 1;
run(async () => {
  const selected = values.model ?? Object.keys(openaiModelCatalog);
  let executed = 0;
  for (const modelId of selected) {
    if (!Object.hasOwn(openaiModelCatalog, modelId))
      throw new Error(`Unknown catalog model: ${modelId}`);
  }
  if (values.live && !process.env.OPENAI_API_KEY)
    throw new Error('--live requires OPENAI_API_KEY');
  const prepared = await Promise.all(
    selected.map(async modelId => ({
      modelId,
      entry: openaiModelCatalog[modelId],
      probes: await allProbes(modelId, openaiModelCatalog[modelId]),
    })),
  );
  console.log(
    `Auditing ${prepared.length} models, ${prepared.reduce((n, { entry }) => n + capabilityCells(entry.capabilities).length, 0)} declared capability cells, ${prepared.reduce((n, { probes }) => n + probes.length, 0)} SDK probe cases.`,
  );
  console.log(
    values.live
      ? 'Mode: model documentation + live API probes.'
      : 'Mode: documentation only. API-only capabilities require --live.',
  );
  for (const { modelId, entry, probes } of prepared) {
    const covered = await checkDocs(modelId, entry, report);
    if (values.live) {
      for (const probe of probes) {
        if (values.probe && !probe.name.includes(values.probe)) continue;
        executed++;
        await checkLive(modelId, probe, report);
        for (const path of probe.covers) covered.add(path);
      }
    }
    // Enumerate the actual catalog, so newly added fields cannot disappear from
    // the audit. Docs-only runs also show the fields that need live probes.
    for (const [path, expected] of uncoveredCapabilities(entry, covered)) {
      report(
        'UNVERIFIED',
        modelId,
        `coverage/${capabilityLabels[path] ?? path}`,
        `catalog=${display(path === 'language.reasoning.sampling' ? expected === 'reasoning-effort-none' : expected)}; ${values.live ? 'probe excluded by --probe' : 'run with --live to test this setting'}`,
      );
    }
  }
  if (values.live && values.probe && executed === 0)
    throw new Error(`No probe matched: ${values.probe}`);
  console.log('\n', counts);
  console.log(
    'MATCH = declarations agree; MISMATCH = contradictory evidence; MISSING = docs field absent from catalog; UNVERIFIED = insufficient evidence.',
  );
  process.exitCode =
    counts.MISMATCH || counts.MISSING ? 1 : counts.UNVERIFIED ? 2 : 0;
});
