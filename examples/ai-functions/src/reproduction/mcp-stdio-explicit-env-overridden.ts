import { Experimental_StdioMCPTransport } from '@ai-sdk/mcp/mcp-stdio';

const bugSignal =
  'BUG REPRODUCED: explicit MCP stdio environment values were overridden';

async function readChildEnvironment(
  env: Record<string, string>,
  keys: string[],
): Promise<Record<string, string | null>> {
  const childScript = `
    const keys = JSON.parse(process.argv[1]);
    const environment = Object.fromEntries(
      keys.map(key => [key, process.env[key] ?? null]),
    );
    process.stdout.write(JSON.stringify({
      jsonrpc: '2.0',
      id: 'environment',
      result: environment,
    }) + '\\n');
  `;

  const transport = new Experimental_StdioMCPTransport({
    command: process.execPath,
    args: ['-e', childScript, JSON.stringify(keys)],
    env,
    stderr: 'pipe',
  });

  try {
    const environmentPromise = new Promise<Record<string, string | null>>(
      (resolve, reject) => {
        const timeout = setTimeout(
          () =>
            reject(new Error('Timed out waiting for the child environment')),
          5_000,
        );

        transport.onerror = reject;
        transport.onmessage = message => {
          if ('result' in message && message.id === 'environment') {
            clearTimeout(timeout);
            resolve(message.result as Record<string, string | null>);
          }
        };
      },
    );

    await transport.start();
    return await environmentPromise;
  } finally {
    await transport.close();
  }
}

async function main() {
  const inheritedKeys =
    process.platform === 'win32'
      ? ['PATH', 'TEMP', 'USERPROFILE']
      : ['HOME', 'PATH'];
  const exactCaseKeys = inheritedKeys.filter(
    key => process.env[key] !== undefined,
  );

  if (!exactCaseKeys.includes('PATH')) {
    throw new Error('Reproduction requires the parent process to have PATH');
  }

  const expectedExactCaseEnvironment = Object.fromEntries(
    exactCaseKeys.map(key => [key, `explicit-${key.toLowerCase()}`]),
  );
  const customEnvironment = {
    ...expectedExactCaseEnvironment,
    REPRO_FLAG: 'explicit-repro-flag',
  };
  const observedExactCaseEnvironment = await readChildEnvironment(
    customEnvironment,
    [...exactCaseKeys, 'REPRO_FLAG'],
  );

  if (observedExactCaseEnvironment.REPRO_FLAG !== 'explicit-repro-flag') {
    throw new Error('The child did not receive the non-default REPRO_FLAG');
  }

  const failures = exactCaseKeys.flatMap(key =>
    observedExactCaseEnvironment[key] === expectedExactCaseEnvironment[key]
      ? []
      : [
          {
            scenario: 'exact-case inherited default',
            key,
            expected: expectedExactCaseEnvironment[key],
            observed: observedExactCaseEnvironment[key],
            parent: process.env[key] ?? null,
          },
        ],
  );

  if (process.platform === 'win32') {
    const expectedPath = 'explicit-native-path';
    const observedNativeCaseEnvironment = await readChildEnvironment(
      {
        Path: expectedPath,
        REPRO_FLAG: 'explicit-repro-flag',
      },
      ['Path', 'PATH', 'REPRO_FLAG'],
    );

    if (observedNativeCaseEnvironment.REPRO_FLAG !== 'explicit-repro-flag') {
      throw new Error(
        'The Windows child did not receive the non-default REPRO_FLAG',
      );
    }

    if (observedNativeCaseEnvironment.Path !== expectedPath) {
      failures.push({
        scenario: 'Windows native Path casing',
        key: 'Path',
        expected: expectedPath,
        observed: observedNativeCaseEnvironment.Path,
        parent: process.env.PATH ?? null,
      });
    }
  }

  if (failures.length > 0) {
    console.error(bugSignal);
    console.error(JSON.stringify(failures, null, 2));
    process.exitCode = 1;
    return;
  }

  console.log(
    'PASS: the MCP stdio child received every explicit environment value',
  );
}

main().catch(error => {
  console.error('Reproduction harness failure:', error);
  process.exitCode = 2;
});
