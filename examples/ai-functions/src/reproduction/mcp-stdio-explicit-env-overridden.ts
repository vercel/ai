import { Experimental_StdioMCPTransport } from '../../../../packages/mcp/src/tool/mcp-stdio/index';

const inheritedKeys =
  process.platform === 'win32'
    ? [
        'APPDATA',
        'HOMEDRIVE',
        'HOMEPATH',
        'LOCALAPPDATA',
        'PATH',
        'PROCESSOR_ARCHITECTURE',
        'SYSTEMDRIVE',
        'SYSTEMROOT',
        'TEMP',
        'USERNAME',
        'USERPROFILE',
      ]
    : ['HOME', 'LOGNAME', 'PATH', 'SHELL', 'TERM', 'USER'];

const childScript = String.raw`
  const keys = JSON.parse(process.argv[1]);
  const environment = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  process.stdout.write(JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    result: { environment },
  }) + '\n');
`;

async function readChildEnvironment(env: Record<string, string>) {
  const keys = Object.keys(env);
  const transport = new Experimental_StdioMCPTransport({
    command: process.execPath,
    args: ['-e', childScript, JSON.stringify(keys)],
    env,
    stderr: 'pipe',
  });

  try {
    const environmentPromise = new Promise<Record<string, string | undefined>>(
      (resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error('Timed out waiting for the MCP child output')),
          5_000,
        );

        transport.onerror = reject;
        transport.onmessage = message => {
          clearTimeout(timeout);
          resolve(
            (
              message as {
                result: {
                  environment: Record<string, string | undefined>;
                };
              }
            ).result.environment,
          );
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
  const originalEnvironment = { ...process.env };
  const failures: string[] = [];

  try {
    for (const key of inheritedKeys) {
      process.env[key] = `parent-${key}`;
    }

    const explicitEnvironment = Object.fromEntries([
      ...inheritedKeys.map(key => [key, `explicit-${key}`]),
      ['REPRO_FLAG', 'explicit-REPRO_FLAG'],
    ]);
    const received = await readChildEnvironment(explicitEnvironment);

    for (const [key, expected] of Object.entries(explicitEnvironment)) {
      if (received[key] !== expected) {
        failures.push(
          `${key}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(received[key])}`,
        );
      }
    }

    if (process.platform === 'win32') {
      const nativePathReceived = await readChildEnvironment({
        Path: 'explicit-Path',
        REPRO_FLAG: 'explicit-native-case-flag',
      });

      if (nativePathReceived.Path !== 'explicit-Path') {
        failures.push(
          `Path: expected "explicit-Path", received ${JSON.stringify(nativePathReceived.Path)}`,
        );
      }
    }
  } finally {
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnvironment)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, originalEnvironment);
  }

  if (failures.length > 0) {
    console.error(
      `MCP_STDIO_ENV_OVERRIDE_BUG: explicit environment values were replaced by parent values\n${failures.join('\n')}`,
    );
    process.exitCode = 1;
    return;
  }

  console.log('Explicit MCP stdio environment values reached the child.');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
