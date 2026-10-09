import { createMCPClient, type MCPTransport } from '@ai-sdk/mcp';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

class MockMCPTransport implements MCPTransport {
  onmessage?: MCPTransport['onmessage'];
  onclose?: MCPTransport['onclose'];
  onerror?: MCPTransport['onerror'];

  async start() {}

  async send(message: Parameters<MCPTransport['send']>[0]) {
    if (!('id' in message) || !('method' in message)) {
      return;
    }

    if (message.method === 'initialize') {
      this.onmessage?.({
        jsonrpc: '2.0',
        id: message.id,
        result: {
          protocolVersion: '2025-11-25',
          serverInfo: { name: 'issue-8347', version: '1.0.0' },
          capabilities: { tools: {} },
        },
      });
    } else if (message.method === 'tools/list') {
      this.onmessage?.({
        jsonrpc: '2.0',
        id: message.id,
        result: {
          tools: [
            {
              name: 'echo',
              inputSchema: {
                type: 'object',
                properties: { text: { type: 'string' } },
                required: ['text'],
              },
            },
          ],
        },
      });
    } else if (message.method === 'tools/call') {
      this.onmessage?.({
        jsonrpc: '2.0',
        id: message.id,
        result: {
          content: [{ type: 'text', text: 'runtime execution succeeded' }],
        },
      });
    }
  }

  async close() {
    this.onclose?.();
  }
}

async function main() {
  const client = await createMCPClient({
    transport: new MockMCPTransport(),
  });

  try {
    const tools = await client.tools();

    // This succeeds at runtime, but the public MCP tool type requires options.
    const result = await tools.echo.execute({ text: 'hello' });

    assert.deepEqual(result, {
      content: [{ type: 'text', text: 'runtime execution succeeded' }],
      isError: false,
    });
  } finally {
    await client.close();
  }

  const scriptPath = fileURLToPath(import.meta.url);
  const program = ts.createProgram({
    rootNames: [scriptPath],
    options: {
      allowSyntheticDefaultImports: true,
      esModuleInterop: true,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      noEmit: true,
      skipLibCheck: true,
      strict: true,
      target: ts.ScriptTarget.ES2022,
      types: ['node'],
    },
  });
  const diagnostics = ts
    .getPreEmitDiagnostics(program)
    .filter(diagnostic => diagnostic.file?.fileName === scriptPath);
  const executeSignatureDiagnostic = diagnostics.find(
    diagnostic =>
      diagnostic.code === 2554 &&
      ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n') ===
        'Expected 2 arguments, but got 1.',
  );
  const unexpectedDiagnostics = diagnostics.filter(
    diagnostic => diagnostic !== executeSignatureDiagnostic,
  );

  assert.deepEqual(
    unexpectedDiagnostics.map(diagnostic =>
      ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
    ),
    [],
    'The reproduction source has unexpected TypeScript diagnostics',
  );

  if (executeSignatureDiagnostic != null) {
    console.error(
      'ISSUE #8347 REPRODUCED: MCP execute(input) succeeds at runtime but TypeScript rejects it with TS2554 because options is required.',
    );
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
