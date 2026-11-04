import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Test-isolation regression: run the actual adapter suites, not a replacement
// adapter. Only the external network boundary is intercepted. No real login or
// provider access is needed or used; the 400 response below is controlled.
async function main() {
  const root = resolve(fileURLToPath(new URL('../../../..', import.meta.url)));
  const packageDirectory = join(root, 'packages/harness-claude-code');
  const temporary = await mkdtemp(join(packageDirectory, '.issue-24498-'));
  try {
    const configDirectory = join(temporary, 'claude');
    const requestLog = join(temporary, 'requests.jsonl');
    const reportPath = join(temporary, 'report.json');
    const setupPath = join(temporary, 'setup.mjs');
    const configPath = join(temporary, 'vitest.config.mjs');
    await mkdir(configDirectory);
    await writeFile(
      setupPath,
      `
import { appendFileSync } from 'node:fs';
import { vi } from 'vitest';
vi.stubGlobal('fetch', async (input, init) => {
  const url = String(input instanceof Request ? input.url : input);
  const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {};
  const leakedDummyRefreshToken =
    url === 'https://platform.claude.com/v1/oauth/token' &&
    body.refresh_token === 'issue-24498-dummy-refresh-token';
  appendFileSync(${JSON.stringify(requestLog)},
    JSON.stringify({ url, leakedDummyRefreshToken }) + '\\n');
  if (!leakedDummyRefreshToken) throw new Error('Unexpected network attempt');
  return Response.json({ error: 'invalid_grant' }, { status: 400 });
});
`,
    );
    await writeFile(
      configPath,
      `
import base from '../vitest.node.config.js';
export default {
  ...base,
  test: { ...base.test, setupFiles: [${JSON.stringify(setupPath)}] },
};
`,
    );

    const env = { ...process.env };
    // Match the report's subscription-only login, without touching host secrets
    // or executing an apiKeyHelper from the developer's home directory.
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
    env.HOME = temporary;
    env.CLAUDE_CONFIG_DIR = configDirectory;

    async function run(label: string) {
      await writeFile(requestLog, '');
      const result = spawnSync(
        'pnpm',
        [
          'exec',
          'vitest',
          'run',
          '--config',
          configPath,
          'src/claude-code-harness.test.ts',
          'src/claude-code-instructions.test.ts',
          '--reporter=json',
          '--outputFile',
          reportPath,
        ],
        {
          cwd: packageDirectory,
          env,
          encoding: 'utf8',
          timeout: 120_000,
          maxBuffer: 8 * 1024 * 1024,
        },
      );
      if (result.error) throw result.error;
      assert.notEqual(result.status, null, 'Vitest must terminate normally');
      const report = JSON.parse(await readFile(reportPath, 'utf8'));
      assert.ok(report.numTotalTests > 0, 'The adapter suites must run');
      const requests = (await readFile(requestLog, 'utf8'))
        .split('\n')
        .filter(Boolean)
        .map(line => JSON.parse(line));
      console.log(
        `${label}: ${report.numPassedTests} passed, ${report.numFailedTests} failed; ${requests.length} intercepted fetch calls`,
      );
      const refreshErrors = report.testResults
        .flatMap(
          (suite: { assertionResults: { failureMessages: string[] }[] }) =>
            suite.assertionResults.flatMap(test => test.failureMessages),
        )
        .filter((message: string) =>
          message.includes('OAuth access token refresh failed with status 400'),
        );
      console.log(`${label}: ${refreshErrors.length} OAuth HTTP 400 failures`);
      return { result, report, requests };
    }

    const baseline = await run('No login');
    assert.equal(baseline.result.status, 0, 'No-login control must pass');
    assert.equal(
      baseline.requests.length,
      0,
      'No-login control must be offline',
    );

    await writeFile(
      join(configDirectory, '.credentials.json'),
      JSON.stringify({
        claudeAiOauth: {
          accessToken: 'issue-24498-dummy-access-token',
          refreshToken: 'issue-24498-dummy-refresh-token',
          expiresAt: 1,
        },
      }),
      { mode: 0o600 },
    );
    const expired = await run('Expired file-backed login');
    const refreshes = expired.requests.filter(
      request => request.leakedDummyRefreshToken,
    );
    if (refreshes.length > 0) {
      throw new Error(
        'ISSUE-24498: adapter tests used ambient credentials to attempt OAuth refresh',
      );
    }
    assert.equal(expired.requests.length, 0, 'Adapter tests must stay offline');
    assert.equal(
      expired.result.status,
      0,
      'Adapter tests must pass independently of an expired subscription login',
    );
    console.log('PASS: adapter suites are isolated from the expired login');
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
