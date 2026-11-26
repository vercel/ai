import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';

const execFileAsync = promisify(execFile);

it('keeps adapter suites offline with an expired ambient Claude login', async () => {
  const directory = await mkdtemp(
    join(tmpdir(), 'claude-code-test-isolation-'),
  );
  try {
    const configDirectory = join(directory, '.claude');
    const requestLog = join(directory, 'requests.jsonl');
    const setupPath = join(directory, 'setup.mjs');
    const configPath = join(directory, 'vitest.config.mjs');
    await mkdir(configDirectory);
    await writeFile(
      join(configDirectory, '.credentials.json'),
      JSON.stringify({
        claudeAiOauth: {
          accessToken: 'test-expired-access-token',
          refreshToken: 'test-refresh-token',
          expiresAt: 1,
        },
      }),
      { mode: 0o600 },
    );
    await writeFile(requestLog, '');
    await writeFile(
      setupPath,
      `
import { appendFileSync } from 'node:fs';
import { vi } from ${JSON.stringify(import.meta.resolve('vitest'))};
vi.stubGlobal('fetch', async (input) => {
  appendFileSync(${JSON.stringify(requestLog)}, String(input) + '\\n');
  return Response.json({ error: 'invalid_grant' }, { status: 400 });
});
`,
    );
    await writeFile(
      configPath,
      `
import base from ${JSON.stringify(new URL('../vitest.node.config.js', import.meta.url).href)};
export default {
  ...base,
  test: { ...base.test, setupFiles: [${JSON.stringify(setupPath)}] },
};
`,
    );
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      HOME: directory,
      USERPROFILE: directory,
      CLAUDE_CONFIG_DIR: configDirectory,
    };
    for (const name of [
      'AI_GATEWAY_API_KEY',
      'VERCEL_OIDC_TOKEN',
      'ANTHROPIC_API_KEY',
      'ANTHROPIC_AUTH_TOKEN',
      'CLAUDE_CODE_OAUTH_TOKEN',
      'ANTHROPIC_BASE_URL',
    ]) {
      delete env[name];
    }
    const { stdout } = await execFileAsync(
      process.execPath,
      [
        fileURLToPath(
          new URL('./vitest.mjs', import.meta.resolve('vitest/package.json')),
        ),
        'run',
        '--config',
        configPath,
        'src/claude-code-harness.test.ts',
        'src/claude-code-instructions.test.ts',
      ],
      {
        cwd: fileURLToPath(new URL('..', import.meta.url)),
        env,
        timeout: 30_000,
      },
    );
    expect(stdout).toContain('2 passed');
    expect(await readFile(requestLog, 'utf8')).toBe('');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 40_000);
