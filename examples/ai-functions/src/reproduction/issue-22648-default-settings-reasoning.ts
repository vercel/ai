import type { LanguageModelV4CallOptions } from '@ai-sdk/provider';
import { defaultSettingsMiddleware } from 'ai';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FAILURE_SIGNAL =
  'REPRODUCED: defaultSettingsMiddleware rejects supported reasoning settings';

async function verifyRuntimeBehavior() {
  const middleware = defaultSettingsMiddleware({
    settings: { reasoning: 'high' },
  } as never);

  const transformParams = middleware.transformParams;
  if (transformParams == null) {
    throw new Error(
      'defaultSettingsMiddleware did not provide transformParams',
    );
  }

  const baseParams: LanguageModelV4CallOptions = {
    prompt: [
      {
        role: 'user',
        content: [{ type: 'text', text: 'Hello' }],
      },
    ],
  };

  const withDefault = await transformParams({
    type: 'generate',
    params: baseParams,
    model: {} as never,
  });
  if (withDefault.reasoning !== 'high') {
    throw new Error(
      'An omitted call reasoning value did not receive the default',
    );
  }

  const withOverride = await transformParams({
    type: 'generate',
    params: { ...baseParams, reasoning: 'low' },
    model: {} as never,
  });
  if (withOverride.reasoning !== 'low') {
    throw new Error(
      'A call-specific reasoning value did not override the default',
    );
  }
}

async function verifyPublicTypes() {
  const reproductionDirectory = dirname(fileURLToPath(import.meta.url));
  const temporaryDirectory = await mkdtemp(
    join(reproductionDirectory, '.issue-22648-'),
  );
  const reportedTypeTestPath = join(
    temporaryDirectory,
    'reported-type-test.mts',
  );
  const contractTypeTestPath = join(
    temporaryDirectory,
    'contract-type-test.ts',
  );

  try {
    await writeFile(
      reportedTypeTestPath,
      `
import { defaultSettingsMiddleware } from 'ai';

defaultSettingsMiddleware({
  settings: { temperature: 0, reasoning: 'high' },
});
`,
    );

    await writeFile(
      contractTypeTestPath,
      `
import { defaultSettingsMiddleware } from 'ai';

const supportedReasoningValues = [
  'provider-default',
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
] as const;

for (const reasoning of supportedReasoningValues) {
  defaultSettingsMiddleware({ settings: { reasoning } });
}

defaultSettingsMiddleware({
  settings: {
    // @ts-expect-error invalid standardized reasoning setting
    reasoning: 'invalid',
  },
});
`,
    );

    const runTypeScript = (arguments_: string[]) =>
      spawnSync(
        'pnpm',
        [
          'exec',
          'tsc',
          '--noEmit',
          '--ignoreConfig',
          '--strict',
          '--skipLibCheck',
          '--target',
          'ES2022',
          ...arguments_,
        ],
        {
          cwd: join(reproductionDirectory, '../..'),
          encoding: 'utf8',
        },
      );

    const reportedResult = runTypeScript([
      '--module',
      'NodeNext',
      reportedTypeTestPath,
    ]);
    const contractResult = runTypeScript([
      '--module',
      'ESNext',
      '--moduleResolution',
      'Bundler',
      contractTypeTestPath,
    ]);

    const results = [reportedResult, contractResult];
    const output = results
      .map(result => `${result.stdout}${result.stderr}`)
      .join('\n');

    if (results.some(result => result.status !== 0)) {
      if (
        output.includes('error TS2353') &&
        output.includes("'reasoning' does not exist")
      ) {
        console.error(FAILURE_SIGNAL);
        process.exitCode = 1;
        return;
      }

      throw new Error(`TypeScript failed for an unexpected reason:\n${output}`);
    }
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

async function main() {
  await verifyRuntimeBehavior();
  await verifyPublicTypes();
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
