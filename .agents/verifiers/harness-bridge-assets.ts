#!/usr/bin/env node

import { dirname, matchesGlob } from 'node:path';
import { runVerifier } from '../../tools/verifiers/api.ts';
import { fileExists, readTextFile } from '../../tools/verifiers/utils.ts';

await runVerifier(async ({ files, reportViolation }) => {
  for (const file of files) {
    if (matchesGlob(file, 'packages/*/src/**/*-bootstrap.ts')) {
      const source = await readTextFile(file);
      const assets = [
        { source: 'package.json', destination: 'package.json' },
        { source: 'pnpm-lock.yaml', destination: 'pnpm-lockfile.yaml' },
      ];

      if (await fileExists(`${dirname(file)}/bridge/pnpm-workspace.yaml`)) {
        assets.push({
          source: 'pnpm-workspace.yaml',
          destination: 'pnpm-workspace.yaml',
        });
      }

      for (const asset of assets) {
        const statement = new RegExp(
          String.raw`(['"])${asset.source.replaceAll('.', '\\.')}\1\s*:\s*new\s+URL\s*\(\s*(['"])\./bridge/${asset.destination.replaceAll('.', '\\.')}\2\s*,\s*import\s*\.\s*meta\s*\.\s*url\s*,?\s*\)`,
        );
        if (!statement.test(source)) {
          reportViolation({ file, violationCode: 'HBA-2' });
        }
      }
      continue;
    }

    if (!matchesGlob(file, 'packages/*/package.json')) continue;

    const manifest = JSON.parse(await readTextFile(file));
    const script = manifest.scripts?.['copy-bridge-assets'];

    if (script === undefined) continue;

    const isAcp = file === 'packages/harness-acp/package.json';
    const bridgePath = isAcp ? 'src/v1/bridge' : 'src/bridge';
    const assets = [
      { source: 'package.json', destination: 'package.json' },
      { source: 'pnpm-lock.yaml', destination: 'pnpm-lockfile.yaml' },
    ];

    if (
      await fileExists(`${dirname(file)}/${bridgePath}/pnpm-workspace.yaml`)
    ) {
      assets.push({
        source: 'pnpm-workspace.yaml',
        destination: 'pnpm-workspace.yaml',
      });
    }

    for (const { source, destination } of assets) {
      const destinationPath = isAcp
        ? `dir + '/${destination}'`
        : `'dist/bridge/${destination}'`;
      const statement = `await fs.copyFile('${bridgePath}/${source}', ${destinationPath});`;
      if (typeof script !== 'string' || !script.includes(statement)) {
        reportViolation({ file, violationCode: 'HBA-1' });
      }
    }
  }
});
