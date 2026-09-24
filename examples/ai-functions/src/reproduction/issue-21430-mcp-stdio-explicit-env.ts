import { Experimental_StdioMCPTransport } from '@ai-sdk/mcp/mcp-stdio';

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

type Scenario = {
  name: string;
  parentEnv: Record<string, string>;
  customEnv: Record<string, string>;
  observedKeys: string[];
  expectedEnv: Record<string, string>;
};

async function readChildEnvironment({
  customEnv,
  observedKeys,
}: Scenario): Promise<Record<string, string | undefined>> {
  const childScript = `
    const keys = ${JSON.stringify(observedKeys)};
    const values = Object.fromEntries(keys.map(key => [key, process.env[key]]));
    process.stdout.write(JSON.stringify({
      jsonrpc: '2.0',
      method: 'issue-21430/environment',
      params: { values },
    }) + '\\n');
  `;

  const transport = new Experimental_StdioMCPTransport({
    command: process.execPath,
    args: ['--eval', childScript],
    env: customEnv,
  });

  try {
    const messagePromise = new Promise<Record<string, string | undefined>>(
      (resolve, reject) => {
        const timeout = setTimeout(
          () =>
            reject(new Error('Timed out waiting for the MCP child output.')),
          5_000,
        );

        transport.onerror = error => {
          clearTimeout(timeout);
          reject(error);
        };

        transport.onmessage = message => {
          if (
            'method' in message &&
            message.method === 'issue-21430/environment' &&
            message.params != null &&
            'values' in message.params
          ) {
            clearTimeout(timeout);
            resolve(
              message.params.values as Record<string, string | undefined>,
            );
          }
        };
      },
    );

    await transport.start();
    return await messagePromise;
  } finally {
    await transport.close();
  }
}

async function runScenario(scenario: Scenario) {
  const originalValues = Object.fromEntries(
    Object.keys(scenario.parentEnv).map(key => [key, process.env[key]]),
  );

  try {
    Object.assign(process.env, scenario.parentEnv);
    const actualEnv = await readChildEnvironment(scenario);

    if (actualEnv.REPRO_FLAG !== scenario.expectedEnv.REPRO_FLAG) {
      throw new Error(
        `Reproduction harness failed: unrelated REPRO_FLAG was ${JSON.stringify(actualEnv.REPRO_FLAG)}.`,
      );
    }

    return Object.entries(scenario.expectedEnv)
      .filter(([key, expected]) => actualEnv[key] !== expected)
      .map(([key, expected]) => ({
        scenario: scenario.name,
        key,
        expected,
        actual: actualEnv[key],
      }));
  } finally {
    for (const [key, value] of Object.entries(originalValues)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

async function main() {
  const exactCaseCustomEnv = Object.fromEntries(
    inheritedKeys.map(key => [key, `issue-21430-custom-${key.toLowerCase()}`]),
  );
  exactCaseCustomEnv.REPRO_FLAG = 'issue-21430-custom-flag';

  const scenarios: Scenario[] = [
    {
      name: 'exact-case inherited keys',
      parentEnv: Object.fromEntries(
        inheritedKeys.map(key => [
          key,
          `issue-21430-parent-${key.toLowerCase()}`,
        ]),
      ),
      customEnv: exactCaseCustomEnv,
      observedKeys: [...inheritedKeys, 'REPRO_FLAG'],
      expectedEnv: exactCaseCustomEnv,
    },
  ];

  if (process.platform === 'win32') {
    scenarios.push({
      name: 'Windows native Path casing',
      parentEnv: { PATH: 'issue-21430-parent-path' },
      customEnv: {
        Path: 'issue-21430-custom-path',
        REPRO_FLAG: 'issue-21430-custom-flag',
      },
      observedKeys: ['PATH', 'REPRO_FLAG'],
      expectedEnv: {
        PATH: 'issue-21430-custom-path',
        REPRO_FLAG: 'issue-21430-custom-flag',
      },
    });
  }

  const mismatches = (
    await Promise.all(scenarios.map(scenario => runScenario(scenario)))
  ).flat();

  if (mismatches.length > 0) {
    console.log(
      JSON.stringify({ platform: process.platform, mismatches }, null, 2),
    );
    throw new Error(
      'Reproduced issue #21430: the MCP child received inherited parent environment values instead of explicit env values.',
    );
  }

  console.log(
    'Explicit MCP stdio env values reached the child for every tested inherited key.',
  );
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
