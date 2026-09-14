import { createServer } from 'node:http';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const field = {
  type: 'string',
  enum: ['any', 'published', 'unpublished', 'unknown'],
  default: 'any',
  description: 'Publication filter; defaults to any.',
};

async function main() {
  const relayedInputs: unknown[] = [];
  const relay = createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) {
      body += chunk;
    }

    const { input } = JSON.parse(body) as { input: unknown };
    relayedInputs.push(input);
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ result: input }));
  });

  relay.listen(0, '127.0.0.1');
  await once(relay, 'listening');

  const address = relay.address();
  if (address == null || typeof address === 'string') {
    throw new Error('Failed to resolve the relay port');
  }

  const harnessPackageJsonUrl = import.meta
    .resolve('@ai-sdk/harness-opencode/package.json');
  const require = createRequire(harnessPackageJsonUrl);
  const bridge = fileURLToPath(
    new URL('./dist/bridge/host-tool-mcp.mjs', harnessPackageJsonUrl),
  );
  const clientModuleUrl = pathToFileURL(
    require.resolve('@modelcontextprotocol/sdk/client/index.js'),
  ).href;
  const transportModuleUrl = pathToFileURL(
    require.resolve('@modelcontextprotocol/sdk/client/stdio.js'),
  ).href;
  const [{ Client }, { StdioClientTransport }] = await Promise.all([
    import(clientModuleUrl),
    import(transportModuleUrl),
  ]);

  const client = new Client({ name: 'schema-repro', version: '1.0.0' });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [bridge],
    env: {
      PATH: process.env.PATH ?? '',
      TOOL_RELAY_URL: `http://127.0.0.1:${address.port}`,
      TOOL_SCHEMAS: JSON.stringify([
        {
          name: 'search',
          description: 'Example search tool.',
          inputSchema: {
            type: 'object',
            properties: { publishStatus: field },
          },
        },
      ]),
    },
  });

  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    const advertised = tools[0]?.inputSchema?.properties?.publishStatus;
    const invalid = await client.callTool({
      name: 'search',
      arguments: { publishStatus: 'not-an-allowed-value' },
    });
    await client.callTool({
      name: 'search',
      arguments: {},
    });

    const result = {
      supplied: field,
      advertised,
      invalidCallIsError: invalid.isError === true,
      relayedInputs,
    };
    console.log(JSON.stringify(result, null, 2));

    const advertisedEnum = (advertised as { enum?: unknown[] } | undefined)
      ?.enum;
    const enumPreserved =
      JSON.stringify(advertisedEnum) === JSON.stringify(field.enum);
    const invalidValueRelayed = relayedInputs.some(
      input =>
        (input as { publishStatus?: unknown })?.publishStatus ===
        'not-an-allowed-value',
    );

    if (!enumPreserved || invalid.isError !== true || invalidValueRelayed) {
      throw new Error(
        'ISSUE_20714_ENUM_CONSTRAINT_DROPPED: out-of-enum input was advertised or accepted by the host-tool bridge',
      );
    }

    const advertisedDefault = (advertised as { default?: unknown } | undefined)
      ?.default;
    if (advertisedDefault !== field.default) {
      throw new Error(
        'ISSUE_20714_DEFAULT_METADATA_DROPPED: supplied JSON Schema default was not advertised',
      );
    }

    const defaultWasApplied = relayedInputs.some(
      input =>
        (input as { publishStatus?: unknown })?.publishStatus === field.default,
    );
    if (defaultWasApplied) {
      throw new Error(
        'ISSUE_20714_DEFAULT_APPLIED_DURING_EXECUTION: default metadata changed the relayed input',
      );
    }

    const advertisedDescription = (
      advertised as { description?: unknown } | undefined
    )?.description;
    if (advertisedDescription !== field.description) {
      throw new Error(
        'ISSUE_20714_DESCRIPTION_CHANGED: the bridge did not preserve the supplied description',
      );
    }
  } finally {
    await client.close();
    await new Promise<void>((resolve, reject) => {
      relay.close(error => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
