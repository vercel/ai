import {
  createMCPClient,
  type CallToolResult,
  type JSONRPCMessage,
  type MCPTransport,
} from '@ai-sdk/mcp';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';

type Response = Pick<CallToolResult, 'content' | 'isError'>;

class MockTransport implements MCPTransport {
  onclose?: () => void;
  onmessage?: (message: JSONRPCMessage) => void;

  response: Response = {
    content: [{ type: 'text', text: 'Job did not run' }],
    isError: false,
  };

  async start() {}

  async close() {
    this.onclose?.();
  }

  async send(message: JSONRPCMessage) {
    if (
      'method' in message &&
      'id' in message &&
      message.method === 'tools/call'
    ) {
      this.onmessage?.({
        jsonrpc: '2.0',
        id: message.id,
        result: this.response,
      });
    }
  }
}

async function executeTool(tool: { execute?: unknown }) {
  const execute = tool.execute as (input: {}) => unknown;
  return await execute({});
}

async function convertToModelOutput(
  tool: { toModelOutput?: unknown },
  toolCallId: string,
  output: unknown,
) {
  const toModelOutput = tool.toModelOutput as (options: {
    toolCallId: string;
    input: unknown;
    output: unknown;
  }) => unknown;

  return await toModelOutput({ toolCallId, input: {}, output });
}

async function main() {
  const transport = new MockTransport();
  const client = await createMCPClient({
    transport,
    initialInitializeResult: {
      protocolVersion: '2025-11-25',
      capabilities: { tools: {} },
      serverInfo: { name: 'mock', version: '1' },
    },
  });

  try {
    const definitions = {
      tools: [
        {
          name: 'run',
          inputSchema: { type: 'object' as const, properties: {} },
        },
      ],
    };
    const dynamicTool = client.toolsFromDefinitions(definitions).run;
    const typedTool = client.toolsFromDefinitions(definitions, {
      schemas: {
        run: {
          inputSchema: z.object({}),
          outputSchema: z.object({ ok: z.boolean() }),
        },
      },
    }).run;

    const indistinguishableCases: string[] = [];

    transport.response = {
      content: [{ type: 'text', text: 'Job did not run' }],
      isError: false,
    };
    const textSuccess = (await executeTool(dynamicTool)) as CallToolResult;
    transport.response = { ...transport.response, isError: true };
    const textError = (await executeTool(dynamicTool)) as CallToolResult;

    if (textSuccess.isError !== false || textError.isError !== true) {
      throw new Error(
        'Reproduction setup failed: execute did not retain the raw MCP isError values',
      );
    }

    const textSuccessModelOutput = await convertToModelOutput(
      dynamicTool,
      'text-success',
      textSuccess,
    );
    const textErrorModelOutput = await convertToModelOutput(
      dynamicTool,
      'text-error',
      textError,
    );
    if (isDeepStrictEqual(textSuccessModelOutput, textErrorModelOutput)) {
      indistinguishableCases.push('raw text');
    }

    transport.response = {
      content: [{ type: 'text', text: 'Job did not run' }],
      isError: true,
    };
    const typedError = (await executeTool(
      typedTool,
    )) as unknown as CallToolResult;
    if (typedError.isError !== true) {
      throw new Error(
        'Reproduction setup failed: typed tool execution did not return the raw MCP error envelope',
      );
    }

    const typedSuccessModelOutput = await convertToModelOutput(
      typedTool,
      'typed-success',
      { ...typedError, isError: false },
    );
    const typedErrorModelOutput = await convertToModelOutput(
      typedTool,
      'typed-error',
      typedError,
    );
    if (isDeepStrictEqual(typedSuccessModelOutput, typedErrorModelOutput)) {
      indistinguishableCases.push('typed error envelope');
    }

    const mixedContent: Response['content'] = [
      { type: 'text', text: 'Job did not run' },
      { type: 'image', data: 'aGVsbG8=', mimeType: 'image/png' },
    ];
    transport.response = { content: mixedContent, isError: false };
    const mixedSuccess = await executeTool(dynamicTool);
    transport.response = { content: mixedContent, isError: true };
    const mixedError = await executeTool(dynamicTool);
    const mixedSuccessModelOutput = await convertToModelOutput(
      dynamicTool,
      'mixed-success',
      mixedSuccess,
    );
    const mixedErrorModelOutput = await convertToModelOutput(
      dynamicTool,
      'mixed-error',
      mixedError,
    );
    if (isDeepStrictEqual(mixedSuccessModelOutput, mixedErrorModelOutput)) {
      indistinguishableCases.push('mixed content');
    }

    if (indistinguishableCases.length > 0) {
      console.error(
        `MCP error results are indistinguishable from successful results in model output: ${indistinguishableCases.join(', ')}`,
      );
      process.exitCode = 1;
    }
  } finally {
    await client.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
