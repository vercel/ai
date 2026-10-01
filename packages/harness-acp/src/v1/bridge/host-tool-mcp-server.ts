import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
  type CallToolResult,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import type { HarnessV1BridgeToolWire } from '@ai-sdk/harness';

declare const __PACKAGE_VERSION__: string | undefined;

const VERSION: string =
  typeof __PACKAGE_VERSION__ !== 'undefined'
    ? __PACKAGE_VERSION__
    : '0.0.0-test';

export type HostToolMCPInvocationResult = {
  readonly output: unknown;
  readonly isError?: boolean;
  readonly correlationToken: string;
};

export type HostToolMCPServer = {
  readonly server: Server;
  updateCatalog(options: {
    revision: number;
    tools: ReadonlyArray<HarnessV1BridgeToolWire>;
  }): Promise<void>;
};

export function createHostToolMCPServer({
  tools,
  revision = 1,
  invoke,
  onListTools,
}: {
  tools: ReadonlyArray<HarnessV1BridgeToolWire>;
  revision?: number;
  invoke: (options: {
    toolName: string;
    input: Readonly<Record<string, unknown>>;
    catalogRevision: number;
  }) => Promise<HostToolMCPInvocationResult>;
  onListTools?: (options: { revision: number }) => Promise<void>;
}): HostToolMCPServer {
  let catalog = createCatalog({ revision, tools });
  let catalogAcknowledgmentError: unknown;
  const server = new Server(
    {
      name: '@ai-sdk/harness-acp-host-tools',
      version: VERSION,
    },
    { capabilities: { tools: { listChanged: true } } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    if (catalogAcknowledgmentError != null) {
      throw catalogAcknowledgmentError;
    }
    const current = catalog;
    if (onListTools != null) {
      setImmediate(() => {
        void onListTools({ revision: current.revision }).catch(error => {
          catalogAcknowledgmentError = error;
        });
      });
    }
    return { tools: current.tools.map(toMCPTool) };
  });
  server.setRequestHandler(CallToolRequestSchema, async request => {
    const current = catalog;
    const tool = current.byName.get(request.params.name);
    if (tool == null) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Unknown host tool: ${request.params.name}`,
      );
    }
    const input = request.params.arguments ?? {};
    const result = await invoke({
      toolName: tool.name,
      input,
      catalogRevision: current.revision,
    });
    return toCallToolResult({ result });
  });

  return {
    server,
    updateCatalog: async ({ revision: nextRevision, tools: nextTools }) => {
      catalog = createCatalog({
        revision: nextRevision,
        tools: nextTools,
      });
      await server.sendToolListChanged();
    },
  };
}

function createCatalog({
  revision,
  tools,
}: {
  revision: number;
  tools: ReadonlyArray<HarnessV1BridgeToolWire>;
}): {
  readonly revision: number;
  readonly tools: ReadonlyArray<HarnessV1BridgeToolWire>;
  readonly byName: ReadonlyMap<string, HarnessV1BridgeToolWire>;
} {
  return {
    revision,
    tools: [...tools],
    byName: new Map(tools.map(tool => [tool.name, tool])),
  };
}

function toMCPTool(tool: HarnessV1BridgeToolWire): Tool {
  return {
    name: tool.name,
    ...(tool.description == null ? {} : { description: tool.description }),
    inputSchema: requireObjectSchema({
      toolName: tool.name,
      schema: tool.inputSchema ?? { type: 'object' },
    }),
  };
}

function requireObjectSchema({
  toolName,
  schema,
}: {
  toolName: string;
  schema: unknown;
}): Tool['inputSchema'] {
  if (
    schema == null ||
    typeof schema !== 'object' ||
    Array.isArray(schema) ||
    (Reflect.get(schema, 'type') !== undefined &&
      Reflect.get(schema, 'type') !== 'object')
  ) {
    throw new Error(
      `Host tool ${toolName} must use an object JSON Schema for MCP.`,
    );
  }
  return schema as Tool['inputSchema'];
}

function toCallToolResult({
  result,
}: {
  result: HostToolMCPInvocationResult;
}): CallToolResult {
  return {
    content: [
      {
        type: 'text',
        text: stringifyOutput({ output: result.output }),
      },
    ],
    ...(result.isError ? { isError: true } : {}),
    _meta: {
      'ai-sdk-harness-acp-correlation': result.correlationToken,
    },
  };
}

function stringifyOutput({ output }: { output: unknown }): string {
  if (output === undefined) return 'null';
  try {
    return JSON.stringify(output);
  } catch {
    return JSON.stringify({
      error: 'Host tool output could not be serialized as JSON.',
    });
  }
}
