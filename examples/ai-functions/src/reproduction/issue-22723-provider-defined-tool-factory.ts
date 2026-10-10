import {
  createProviderDefinedToolFactory,
  jsonSchema,
} from '@ai-sdk/provider-utils';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const failureSignal =
  'ISSUE_22723: TypeScript rejects outputSchema in ProviderDefinedToolFactory options';

const typecheckSource = `
import {
  createProviderDefinedToolFactory,
  jsonSchema,
} from '@ai-sdk/provider-utils';

const factory = createProviderDefinedToolFactory<{}, {}>({
  id: 'example.task',
  inputSchema: jsonSchema<{}>({ type: 'object' }),
});

const value = factory({
  outputSchema: jsonSchema<number>({ type: 'number' }),
});

type InferredOutput = Parameters<
  NonNullable<typeof value.toModelOutput>
>[0]['output'];
type OutputIsNumber = [InferredOutput] extends [number]
  ? [number] extends [InferredOutput]
    ? true
    : false
  : false;
const outputIsNumber: OutputIsNumber = true;
void outputIsNumber;
`;

async function main() {
  const reproductionDirectory = dirname(fileURLToPath(import.meta.url));
  const workspaceDirectory = join(reproductionDirectory, '../../../..');
  const providerUtilsBuild = spawnSync(
    'pnpm',
    ['-C', 'packages/provider-utils', 'build'],
    {
      cwd: workspaceDirectory,
      encoding: 'utf8',
    },
  );
  assert.equal(
    providerUtilsBuild.status,
    0,
    `provider-utils build failed:\n${providerUtilsBuild.stdout}${providerUtilsBuild.stderr}`,
  );

  const outputSchema = jsonSchema<number>({ type: 'number' });
  const factory = createProviderDefinedToolFactory<{}, {}>({
    id: 'example.task',
    inputSchema: jsonSchema<{}>({ type: 'object' }),
  });
  const value = Reflect.apply(factory, undefined, [
    { outputSchema, execute: async () => 1 },
  ]) as {
    outputSchema?: unknown;
    args: Record<string, unknown>;
  };

  assert.equal(
    value.outputSchema,
    outputSchema,
    'runtime should preserve outputSchema on the provider-defined tool',
  );
  assert.equal(
    'outputSchema' in value.args,
    false,
    'runtime should not leak outputSchema into provider args',
  );

  const typecheckPath = join(
    reproductionDirectory,
    `.issue-22723-typecheck-${process.pid}.mts`,
  );
  const tscPath = createRequire(import.meta.url).resolve(
    'typescript/lib/tsc.js',
  );

  await writeFile(typecheckPath, typecheckSource);
  try {
    const result = spawnSync(
      process.execPath,
      [
        tscPath,
        '--strict',
        '--skipLibCheck',
        '--ignoreConfig',
        '--noEmit',
        '--module',
        'nodenext',
        '--target',
        'es2022',
        typecheckPath,
      ],
      {
        cwd: join(reproductionDirectory, '../..'),
        encoding: 'utf8',
      },
    );
    const compilerOutput = `${result.stdout}${result.stderr}`;

    if (result.status !== 0) {
      assert.match(
        compilerOutput,
        /TS2353[\s\S]*outputSchema[\s\S]*does not exist/,
        `unexpected TypeScript failure:\n${compilerOutput}`,
      );
      console.error(failureSignal);
      console.error(compilerOutput.trim());
      process.exitCode = 1;
      return;
    }

    console.log(
      'Issue #22723 did not reproduce: outputSchema was accepted and inferred.',
    );
  } finally {
    await rm(typecheckPath, { force: true });
  }
}

main().catch(error => {
  console.error('REPRODUCTION_HARNESS_ERROR', error);
  process.exitCode = 2;
});
