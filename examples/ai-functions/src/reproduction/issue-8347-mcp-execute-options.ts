import assert from 'node:assert/strict';
import path from 'node:path';
import {
  createMCPClient,
  type JSONRPCMessage,
  type MCPTransport,
} from '@ai-sdk/mcp';
import ts from 'typescript';

const failureSignal =
  'ISSUE #8347: MCP tool execute requires an options argument even though the implementation accepts its absence.';

class EchoTransport implements MCPTransport {
  onmessage?: (message: JSONRPCMessage) => void;
  onclose?: () => void;
  onerror?: (error: Error) => void;

  async start(): Promise<void> {}

  async send(message: JSONRPCMessage): Promise<void> {
    if (
      'id' in message &&
      'method' in message &&
      message.method === 'tools/call'
    ) {
      this.onmessage?.({
        jsonrpc: '2.0',
        id: message.id,
        result: {
          content: [{ type: 'text', text: 'runtime call succeeded' }],
          isError: false,
        },
      });
    }
  }

  async close(): Promise<void> {
    this.onclose?.();
  }
}

async function verifyRuntimeAcceptsMissingOptions(): Promise<void> {
  const client = await createMCPClient({
    transport: new EchoTransport(),
    initialInitializeResult: {
      protocolVersion: '2025-11-25',
      capabilities: { tools: {} },
      serverInfo: { name: 'issue-8347-reproduction', version: '1.0.0' },
    },
  });

  try {
    const tools = client.toolsFromDefinitions({
      tools: [
        {
          name: 'echo',
          inputSchema: {
            type: 'object',
            properties: { text: { type: 'string' } },
          },
        },
      ],
    });

    const executeWithoutOptions = tools.echo.execute as (
      input: unknown,
    ) => Promise<unknown>;
    const result = await executeWithoutOptions({ text: 'hello' });

    assert.deepEqual(result, {
      content: [{ type: 'text', text: 'runtime call succeeded' }],
      isError: false,
    });
  } finally {
    await client.close();
  }
}

function getPublicContractDiagnostics(): ts.Diagnostic[] {
  const virtualFileName = path.join(
    process.cwd(),
    'src/reproduction/issue-8347-public-contract.ts',
  );
  const source = `
import type { MCPClient } from '@ai-sdk/mcp';

declare const client: MCPClient;
const tools = client.toolsFromDefinitions({
  tools: [{
    name: 'echo',
    inputSchema: {
      type: 'object',
      properties: { text: { type: 'string' } },
    },
  }],
});

void tools.echo.execute({ text: 'hello' });
`;
  const compilerOptions: ts.CompilerOptions = {
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    noEmit: true,
    skipLibCheck: true,
    strict: true,
    target: ts.ScriptTarget.ES2022,
  };
  const host = ts.createCompilerHost(compilerOptions);
  const originalFileExists = host.fileExists;
  const originalGetSourceFile = host.getSourceFile;

  host.fileExists = fileName =>
    fileName === virtualFileName || originalFileExists(fileName);
  host.getSourceFile = (fileName, languageVersion, onError, shouldCreate) =>
    fileName === virtualFileName
      ? ts.createSourceFile(fileName, source, languageVersion, true)
      : originalGetSourceFile(fileName, languageVersion, onError, shouldCreate);

  const program = ts.createProgram([virtualFileName], compilerOptions, host);

  return ts
    .getPreEmitDiagnostics(program)
    .filter(diagnostic => diagnostic.file?.fileName === virtualFileName);
}

async function main(): Promise<void> {
  await verifyRuntimeAcceptsMissingOptions();

  const diagnostics = getPublicContractDiagnostics();
  const expectedDiagnostic = diagnostics.find(
    diagnostic =>
      diagnostic.code === 2554 &&
      ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n') ===
        'Expected 2 arguments, but got 1.',
  );

  if (expectedDiagnostic != null) {
    console.error(failureSignal);
    process.exitCode = 1;
    return;
  }

  if (diagnostics.length > 0) {
    throw new Error(
      `Unexpected TypeScript diagnostics:\n${ts.formatDiagnosticsWithColorAndContext(
        diagnostics,
        {
          getCanonicalFileName: fileName => fileName,
          getCurrentDirectory: () => process.cwd(),
          getNewLine: () => '\n',
        },
      )}`,
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
