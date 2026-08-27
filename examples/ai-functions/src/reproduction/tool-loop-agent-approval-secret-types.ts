import path from 'node:path';
import { ToolLoopAgent, tool, type ToolLoopAgentSettings } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import ts from 'typescript';
import { z } from 'zod/v4';

const failureSignal =
  'ISSUE_19874_REPRODUCED: ToolLoopAgent types reject experimental_toolApprovalSecret in settings and prepareCall.';

async function verifyRuntimeSupport() {
  const secret = 'issue-19874-runtime-secret';
  const tools = {
    sensitiveTool: tool({
      inputSchema: z.object({ value: z.string() }),
    }),
  };
  let prepareCallSecret: unknown;

  const settings = {
    model: new MockLanguageModelV4({
      doGenerate: async () => ({
        content: [
          {
            type: 'tool-call' as const,
            toolCallType: 'function' as const,
            toolCallId: 'call-1',
            toolName: 'sensitiveTool',
            input: '{"value":"test"}',
          },
        ],
        finishReason: { unified: 'tool-calls' as const, raw: undefined },
        usage: {
          inputTokens: {
            total: 3,
            noCache: 3,
            cacheRead: undefined,
            cacheWrite: undefined,
          },
          outputTokens: {
            total: 10,
            text: 10,
            reasoning: undefined,
          },
        },
        warnings: [],
      }),
    }),
    tools,
    toolApproval: { sensitiveTool: 'user-approval' as const },
    experimental_toolApprovalSecret: secret,
    prepareCall: (call: Record<string, unknown>) => {
      prepareCallSecret = call.experimental_toolApprovalSecret;
      return call;
    },
  } as unknown as ToolLoopAgentSettings<never, typeof tools>;

  const result = await new ToolLoopAgent(settings).generate({ prompt: 'test' });
  const responseMessages = JSON.stringify(result.response.messages);

  if (
    prepareCallSecret !== secret ||
    !responseMessages.includes('"type":"tool-approval-request"') ||
    !responseMessages.includes('"signature":"')
  ) {
    throw new Error(
      'Runtime precondition failed: ToolLoopAgent did not forward and honor the approval secret.',
    );
  }
}

async function main() {
  await verifyRuntimeSupport();

  const consumerPath = path.resolve(
    'src/reproduction/issue-19874-type-consumer.ts',
  );
  const consumerSource = `
import type { ToolLoopAgentSettings } from 'ai';

const secret = new Uint8Array(32);

const settings: ToolLoopAgentSettings = {
  model: null as never,
  experimental_toolApprovalSecret: secret,
};

type PrepareCall = NonNullable<ToolLoopAgentSettings['prepareCall']>;
type PrepareCallInput = Parameters<PrepareCall>[0];
type PrepareCallResult = Awaited<ReturnType<PrepareCall>>;

declare const prepareCallInput: PrepareCallInput;
declare const prepareCallResult: PrepareCallResult;

const inputSecret: string | Uint8Array | undefined =
  prepareCallInput.experimental_toolApprovalSecret;
const resultSecret: string | Uint8Array | undefined =
  prepareCallResult.experimental_toolApprovalSecret;

void settings;
void inputSecret;
void resultSecret;
`;

  const compilerOptions: ts.CompilerOptions = {
    allowSyntheticDefaultImports: true,
    esModuleInterop: true,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    noEmit: true,
    skipLibCheck: true,
    strict: true,
    target: ts.ScriptTarget.ES2022,
    types: ['node'],
  };
  const defaultHost = ts.createCompilerHost(compilerOptions, true);
  const host: ts.CompilerHost = {
    ...defaultHost,
    fileExists: fileName =>
      path.resolve(fileName) === consumerPath ||
      defaultHost.fileExists(fileName),
    getSourceFile: (
      fileName,
      languageVersion,
      onError,
      shouldCreateNewSourceFile,
    ) =>
      path.resolve(fileName) === consumerPath
        ? ts.createSourceFile(
            consumerPath,
            consumerSource,
            languageVersion,
            true,
            ts.ScriptKind.TS,
          )
        : defaultHost.getSourceFile(
            fileName,
            languageVersion,
            onError,
            shouldCreateNewSourceFile,
          ),
    readFile: fileName =>
      path.resolve(fileName) === consumerPath
        ? consumerSource
        : defaultHost.readFile(fileName),
  };

  const diagnostics = ts
    .getPreEmitDiagnostics(
      ts.createProgram({
        rootNames: [consumerPath],
        options: compilerOptions,
        host,
      }),
    )
    .filter(diagnostic => diagnostic.file?.fileName === consumerPath);

  if (diagnostics.length === 0) {
    console.log(
      'ToolLoopAgent settings and prepareCall accept experimental_toolApprovalSecret.',
    );
    return;
  }

  const diagnosticText = diagnostics
    .map(diagnostic =>
      ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
    )
    .join('\n');

  if (
    diagnostics.length === 3 &&
    diagnostics.every(diagnostic =>
      ts
        .flattenDiagnosticMessageText(diagnostic.messageText, '\n')
        .includes('experimental_toolApprovalSecret'),
    ) &&
    diagnosticText.includes(
      "'experimental_toolApprovalSecret' does not exist in type 'ToolLoopAgentSettings'",
    ) &&
    diagnostics.filter(diagnostic => diagnostic.code === 2339).length === 2
  ) {
    console.error(failureSignal);
    process.exitCode = 1;
    return;
  }

  console.error('Unexpected TypeScript diagnostics:');
  console.error(diagnosticText);
  process.exitCode = 2;
}

main().catch(error => {
  console.error(error);
  process.exitCode = 2;
});
