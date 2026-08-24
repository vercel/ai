import { spawn } from 'node:child_process';

const scenarios = [
  {
    name: 'undefined fetch',
    setup: 'globalThis.fetch = undefined;',
  },
  {
    name: 'non-callable fetch',
    setup: 'globalThis.fetch = {};',
  },
] as const;

async function verifyImport({
  name,
  setup,
}: (typeof scenarios)[number]): Promise<void> {
  const result = await new Promise<{
    code: number | null;
    stderr: string;
  }>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        '--no-warnings',
        '--input-type=module',
        '--eval',
        `${setup} await import('@ai-sdk/provider-utils');`,
      ],
      {
        cwd: process.cwd(),
        stdio: ['ignore', 'ignore', 'pipe'],
      },
    );
    let stderr = '';

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', chunk => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', code => resolve({ code, stderr }));
  });

  if (result.code !== 0) {
    throw new Error(
      `@ai-sdk/provider-utils import failed with ${name}:\n${result.stderr}`,
    );
  }

  console.log(`Import succeeded with ${name}.`);
}

async function main(): Promise<void> {
  for (const scenario of scenarios) {
    await verifyImport(scenario);
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
