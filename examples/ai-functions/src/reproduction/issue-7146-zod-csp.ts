import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import * as nodeModule from 'node:module';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const cspError =
  "Content Security Policy of your site blocks the use of 'eval' in JavaScript";

type ScenarioResult = {
  blockedEvalAttempts: number;
  chatStatus: string;
  zodVersion: string;
};

type ResolveResult = {
  format?: string;
  shortCircuit?: boolean;
  url: string;
};

const registerHooks = (
  nodeModule as unknown as {
    registerHooks(options: {
      resolve(
        specifier: string,
        context: unknown,
        nextResolve: (specifier: string, context: unknown) => ResolveResult,
      ): ResolveResult;
    }): { deregister(): void };
  }
).registerHooks;

async function readPackageVersion(packageJsonUrl: URL): Promise<string> {
  return JSON.parse(await readFile(packageJsonUrl, 'utf8')).version;
}

function installStrictCspSimulation() {
  const OriginalFunction = globalThis.Function;
  let blockedEvalAttempts = 0;

  globalThis.Function = new Proxy(OriginalFunction, {
    apply() {
      blockedEvalAttempts += 1;
      throw new EvalError(cspError);
    },
    construct() {
      blockedEvalAttempts += 1;
      throw new EvalError(cspError);
    },
  });

  return {
    get blockedEvalAttempts() {
      return blockedEvalAttempts;
    },
    restore() {
      globalThis.Function = OriginalFunction;
    },
  };
}

async function runReportedSetup(): Promise<ScenarioResult> {
  const csp = installStrictCspSimulation();

  try {
    const { Chat } = await import('../../../../packages/vue/dist/index.js');

    // This matches configuring Zod after normal static imports have already
    // initialized the AI SDK module graph. The CSP attempt has already occurred.
    const z =
      await import('../../../../packages/ai/node_modules/zod/v4/index.js');
    z.config({ jitless: true });

    const chat = new Chat({});

    return {
      blockedEvalAttempts: csp.blockedEvalAttempts,
      chatStatus: chat.status,
      zodVersion: await readPackageVersion(
        new URL(
          '../../../../packages/ai/node_modules/zod/package.json',
          import.meta.url,
        ),
      ),
    };
  } finally {
    csp.restore();
  }
}

async function runCurrentSupportedSetup(): Promise<ScenarioResult> {
  const zodPackageUrl = new URL(
    '../../../../node_modules/.pnpm/zod@4.4.3/node_modules/zod/',
    import.meta.url,
  );
  const zodV4Url = new URL('v4/index.js', zodPackageUrl);
  const z = await import(zodV4Url.href);

  // Zod 4.4.2+ skips the eval probe when jitless is configured before code
  // initializes object schemas.
  z.config({ jitless: true });

  const hooks = registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier === 'zod/v4') {
        return { shortCircuit: true, url: zodV4Url.href };
      }
      return nextResolve(specifier, context);
    },
  });
  const csp = installStrictCspSimulation();

  try {
    const { Chat } = await import('../../../../packages/vue/dist/index.js');
    const chat = new Chat({});

    return {
      blockedEvalAttempts: csp.blockedEvalAttempts,
      chatStatus: chat.status,
      zodVersion: await readPackageVersion(
        new URL('package.json', zodPackageUrl),
      ),
    };
  } finally {
    csp.restore();
    hooks.deregister();
  }
}

async function runIsolatedScenario(
  scenario: 'reported' | 'current',
): Promise<ScenarioResult> {
  const scriptPath = fileURLToPath(import.meta.url);
  const { stdout } = await execFileAsync(
    process.execPath,
    ['--import', 'tsx', scriptPath, scenario],
    {
      cwd: process.cwd(),
      env: { ...process.env, NODE_NO_WARNINGS: '1' },
    },
  );

  return JSON.parse(stdout.trim());
}

async function main() {
  const scenario = process.argv[2];

  if (scenario === 'reported') {
    console.log(JSON.stringify(await runReportedSetup()));
    return;
  }

  if (scenario === 'current') {
    console.log(JSON.stringify(await runCurrentSupportedSetup()));
    return;
  }

  const reported = await runIsolatedScenario('reported');
  const current = await runIsolatedScenario('current');

  assert.equal(reported.zodVersion, '3.25.76');
  assert.equal(reported.chatStatus, 'ready');
  assert.ok(
    reported.blockedEvalAttempts > 0,
    'expected the reported setup to attempt eval under strict CSP',
  );

  assert.equal(current.zodVersion, '4.4.3');
  assert.equal(current.chatStatus, 'ready');
  assert.equal(
    current.blockedEvalAttempts,
    0,
    'expected current Zod with early jitless configuration to avoid eval',
  );

  console.log(
    `Issue #7146 comparison passed: Zod ${reported.zodVersion} triggered ${reported.blockedEvalAttempts} blocked eval attempt; Zod ${current.zodVersion} with early jitless configuration triggered none.`,
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
