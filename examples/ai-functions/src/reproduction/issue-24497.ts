import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OPENCODE_SUBSCRIPTION_ACCESS_TOKEN_ENVIRONMENT_VARIABLE } from '../../../../packages/harness-opencode/src/opencode-auth';
import {
  readOpenCodeSubscription,
  resolveOpenCodeAuthentication,
} from '../../../../packages/harness-opencode/src/opencode-subscription';

// Local credential-discovery regression, not a provider/API integration test.
// Use the real harness implementation and its platform/home injection points.
async function main() {
  const homeDirectory = await mkdtemp(
    fileURLToPath(new URL('./issue-24497-home-', import.meta.url)),
  );
  try {
    const expires = Date.now() + 3_600_000;
    const oauth = (access: string) => ({
      type: 'oauth',
      access,
      refresh: access,
      expires,
    });
    const store = {
      openai: { ...oauth('openai-token'), accountId: 'account-1' },
      xai: oauth('xai-token'),
      'github-copilot': oauth('copilot-token'),
      poe: oauth('poe-token'),
      'opencode-go': { type: 'api', key: 'go-token' },
      gitlab: oauth('gitlab-token'),
    };
    const authDirectory = join(homeDirectory, '.local', 'share', 'opencode');
    const authPath = join(authDirectory, 'auth.json');
    await mkdir(authDirectory, { recursive: true });
    await writeFile(authPath, JSON.stringify(store));
    const expected = {
      providerId: 'openai',
      accessToken: 'openai-token',
      accountId: 'account-1',
    };
    for (const platform of ['linux', 'darwin'] as const) {
      assert.deepEqual(
        await readOpenCodeSubscription({
          providerId: 'openai',
          homeDirectory,
          env: {},
          platform,
        }),
        expected,
      );
    }
    for (const platform of ['win32', 'linux', 'darwin'] as const) {
      assert.deepEqual(
        await readOpenCodeSubscription({
          providerId: 'openai',
          homeDirectory,
          platform,
          env: { XDG_DATA_HOME: join(homeDirectory, '.local', 'share') },
        }),
        expected,
      );
    }
    console.log(
      'PASS: Linux/macOS default paths and explicit XDG_DATA_HOME on all platforms',
    );

    const failures: string[] = [];
    for (const [providerId, accessToken] of [
      ['openai', 'openai-token'],
      ['xai', 'xai-token'],
      ['github-copilot', 'copilot-token'],
      ['poe', 'poe-token'],
      ['opencode-go', 'go-token'],
      ['gitlab', 'gitlab-token'],
    ]) {
      const result = await resolveOpenCodeAuthentication({
        auth: 'auto',
        provider: providerId,
        processEnv: {},
        readSubscription: options =>
          readOpenCodeSubscription({
            ...options,
            homeDirectory,
            platform: 'win32',
          }),
      });
      console.log(
        `Windows ${providerId}: subscription=${result.subscription?.providerId ?? 'undefined'}`,
      );
      if (
        result.subscription?.accessToken !== accessToken ||
        result.environment[
          OPENCODE_SUBSCRIPTION_ACCESS_TOKEN_ENVIRONMENT_VARIABLE
        ] !== accessToken
      ) {
        failures.push(providerId);
      }
    }

    // Exercise the report's expiring OpenAI scenario without contacting OAuth.
    await writeFile(
      authPath,
      JSON.stringify({
        openai: { ...store.openai, expires: Date.now() + 60_000 },
      }),
    );
    const refreshed = await readOpenCodeSubscription({
      providerId: 'openai',
      homeDirectory,
      platform: 'win32',
      env: {},
      fetch: async () =>
        Response.json({
          access_token: 'refreshed-token',
          refresh_token: 'refreshed-refresh',
          expires_in: 3600,
        }),
    });
    if (refreshed?.accessToken !== 'refreshed-token') {
      failures.push('expiring-openai');
    } else {
      assert.match(await readFile(authPath, 'utf8'), /refreshed-refresh/);
    }

    // Separate home: a valid fix must preserve legacy GitLab-only discovery.
    const legacyHome = join(homeDirectory, 'legacy-home');
    await mkdir(join(legacyHome, '.opencode'), { recursive: true });
    await writeFile(
      join(legacyHome, '.opencode', 'auth.json'),
      JSON.stringify({ gitlab: store.gitlab }),
    );
    assert.deepEqual(
      await readOpenCodeSubscription({
        providerId: 'gitlab',
        homeDirectory: legacyHome,
        platform: 'win32',
        env: {},
      }),
      { providerId: 'gitlab', accessToken: 'gitlab-token' },
    );
    console.log('PASS: Windows legacy GitLab plugin store remains readable');
    assert.equal(
      failures.length,
      0,
      `ISSUE-24497: Windows cannot reuse subscriptions from the standard OpenCode auth store: ${failures.join(', ')}`,
    );
    console.log('PASS: Windows discovers and reuses OpenCode subscriptions');
  } finally {
    await rm(homeDirectory, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
