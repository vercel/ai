import { spawnSync } from 'node:child_process';
import {
  cpSync,
  lstatSync,
  mkdirSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const FAILURE_SIGNAL =
  'ISSUE_20918_REPRODUCED: bundled URL download failed because undici was not included';

type NodeFileTrace = (
  files: string[],
  options: { base: string },
) => Promise<{ fileList: Set<string> }>;

async function main() {
  const repositoryRoot = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../../..',
  );
  const sourceDirectory = join(repositoryRoot, '.issue-20918-source');
  const deploymentDirectory = join(repositoryRoot, '.issue-20918-deployment');
  const entryPath = join(sourceDirectory, 'entry.mjs');
  const packageDirectories = [
    join(repositoryRoot, 'packages/provider'),
    join(repositoryRoot, 'packages/provider-utils'),
  ];

  rmSync(sourceDirectory, { recursive: true, force: true });
  rmSync(deploymentDirectory, { recursive: true, force: true });
  mkdirSync(sourceDirectory, { recursive: true });

  try {
    for (const packageDirectory of packageDirectories) {
      const build = spawnSync('pnpm', ['build'], {
        cwd: packageDirectory,
        encoding: 'utf8',
      });
      if (build.status !== 0) {
        throw new Error(
          `Failed to build ${packageDirectory}:\n${build.stdout}${build.stderr}`,
        );
      }
    }

    writeFileSync(
      entryPath,
      `
async function main() {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (input, init) => originalFetch(input, init);

  const { downloadBlob } = await import('../packages/provider-utils/dist/index.js');
  const blob = await downloadBlob('https://example.com/');

  if (blob.size === 0) {
    throw new Error('Expected the bundled URL download to return bytes');
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
`,
    );

    const require = createRequire(join(repositoryRoot, 'package.json'));
    const { nodeFileTrace } = require('next/dist/compiled/@vercel/nft') as {
      nodeFileTrace: NodeFileTrace;
    };
    const trace = await nodeFileTrace([entryPath], {
      base: repositoryRoot,
    });

    for (const file of trace.fileList) {
      const source = join(repositoryRoot, file);
      const destination = join(deploymentDirectory, file);
      mkdirSync(dirname(destination), { recursive: true });
      if (lstatSync(source).isSymbolicLink()) {
        symlinkSync(readlinkSync(source), destination);
      } else {
        cpSync(source, destination, { recursive: true });
      }
    }

    const deployedEntryPath = join(
      deploymentDirectory,
      '.issue-20918-source/entry.mjs',
    );
    const childEnv = { ...process.env };
    delete childEnv.NODE_PATH;
    const execution = spawnSync(process.execPath, [deployedEntryPath], {
      cwd: deploymentDirectory,
      encoding: 'utf8',
      env: childEnv,
    });
    const output = `${execution.stdout}${execution.stderr}`;

    if (
      execution.status !== 0 &&
      output.includes("Cannot find module 'undici'")
    ) {
      console.error(FAILURE_SIGNAL);
      process.exitCode = 1;
      return;
    }

    if (execution.status !== 0) {
      throw new Error(`Bundled download failed unexpectedly:\n${output}`);
    }
  } finally {
    rmSync(sourceDirectory, { recursive: true, force: true });
    rmSync(deploymentDirectory, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
