import ts from 'typescript';
import { fileURLToPath } from 'node:url';

const reproductionSource = `
import { tool } from 'ai';
import { z } from 'zod';
import { WorkflowAgent } from '../../../../packages/workflow/src/index.js';

type IsAny<T> = 0 extends 1 & T ? true : false;

function expectType<T>(_value: T): void {}

const tools = {
  lookup: tool({
    inputSchema: z.object({ query: z.string() }),
    execute: async () => ({ count: 1 }),
  }),
};

new WorkflowAgent({
  model: 'anthropic/claude-sonnet-4-6',
  runtimeContext: { tenantId: 'tenant-1' },
  tools,
  stopWhen: ({ steps }) => {
    const last = steps.at(-1);
    if (last == null) return false;

    expectType<false>(
      undefined as unknown as IsAny<typeof last.runtimeContext>, // CONSTRUCTOR_CONTEXT
    );

    const call = last.staticToolCalls[0];
    if (call != null) {
      expectType<'lookup'>(call.toolName); // CONSTRUCTOR_TOOL_NAME
      expectType<false>(undefined as unknown as IsAny<typeof call.input>); // CONSTRUCTOR_TOOL_INPUT
      expectType<{ query: string }>(call.input);
    }

    const result = last.staticToolResults[0];
    if (result != null) {
      expectType<false>(
        undefined as unknown as IsAny<typeof result.output>, // CONSTRUCTOR_TOOL_OUTPUT
      );
      expectType<{ count: number }>(result.output);
    }

    return last.runtimeContext.tenantId === 'tenant-1';
  },
});

const agent = new WorkflowAgent({
  model: 'anthropic/claude-sonnet-4-6',
  runtimeContext: { tenantId: 'tenant-1' },
  tools,
});

void agent.stream({
  prompt: 'Look something up.',
  stopWhen: ({ steps }) => {
    const last = steps.at(-1);
    if (last == null) return false;

    expectType<false>(
      undefined as unknown as IsAny<typeof last.runtimeContext>, // STREAM_CONTEXT
    );

    const call = last.staticToolCalls[0];
    if (call != null) {
      expectType<'lookup'>(call.toolName); // STREAM_TOOL_NAME
      expectType<false>(undefined as unknown as IsAny<typeof call.input>); // STREAM_TOOL_INPUT
      expectType<{ query: string }>(call.input);
    }

    const result = last.staticToolResults[0];
    if (result != null) {
      expectType<false>(
        undefined as unknown as IsAny<typeof result.output>, // STREAM_TOOL_OUTPUT
      );
      expectType<{ count: number }>(result.output);
    }

    return last.runtimeContext.tenantId === 'tenant-1';
  },
});
`;

const expectedDiagnosticMarkers = [
  'CONSTRUCTOR_CONTEXT',
  'CONSTRUCTOR_TOOL_NAME',
  'CONSTRUCTOR_TOOL_INPUT',
  'CONSTRUCTOR_TOOL_OUTPUT',
  'STREAM_CONTEXT',
  'STREAM_TOOL_NAME',
  'STREAM_TOOL_INPUT',
  'STREAM_TOOL_OUTPUT',
] as const;

async function main() {
  const reproductionPath = fileURLToPath(
    new URL('./issue-20076-type-fixture.ts', import.meta.url),
  );
  const compilerOptions = {
    allowImportingTsExtensions: true,
    esModuleInterop: true,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    noEmit: true,
    skipLibCheck: true,
    strict: true,
    target: ts.ScriptTarget.ES2022,
  } satisfies ts.CompilerOptions;
  const host = ts.createCompilerHost(compilerOptions);
  const defaultGetSourceFile = host.getSourceFile.bind(host);

  host.fileExists = fileName =>
    fileName === reproductionPath || ts.sys.fileExists(fileName);
  host.readFile = fileName =>
    fileName === reproductionPath
      ? reproductionSource
      : ts.sys.readFile(fileName);
  host.getSourceFile = (fileName, languageVersion, onError, shouldCreate) =>
    fileName === reproductionPath
      ? ts.createSourceFile(
          fileName,
          reproductionSource,
          languageVersion,
          true,
          ts.ScriptKind.TS,
        )
      : defaultGetSourceFile(fileName, languageVersion, onError, shouldCreate);

  const program = ts.createProgram([reproductionPath], compilerOptions, host);

  const diagnostics = ts
    .getPreEmitDiagnostics(program)
    .filter(diagnostic => diagnostic.file?.fileName === reproductionPath);

  if (diagnostics.length === 0) {
    console.log(
      'WorkflowAgent stopWhen preserved configured tool and runtime-context types.',
    );
    return;
  }

  const sourceFile = program.getSourceFile(reproductionPath);
  if (sourceFile == null) {
    throw new Error('Could not load the reproduction source file.');
  }

  const diagnosticLines = diagnostics.map(diagnostic => {
    const line =
      diagnostic.start == null
        ? ''
        : sourceFile.text.split(/\r?\n/u)[
            sourceFile.getLineAndCharacterOfPosition(diagnostic.start).line
          ];
    return {
      code: diagnostic.code,
      line,
      message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
    };
  });

  const missingMarkers = expectedDiagnosticMarkers.filter(
    marker =>
      !diagnosticLines.some(diagnostic => diagnostic.line?.includes(marker)),
  );

  if (missingMarkers.length > 0) {
    console.error(JSON.stringify(diagnosticLines, null, 2));
    throw new Error(
      `Unexpected TypeScript diagnostics; missing markers: ${missingMarkers.join(', ')}`,
    );
  }

  console.error(JSON.stringify(diagnosticLines, null, 2));
  throw new Error(
    'Reproduced issue #20076: WorkflowAgent stopWhen erased configured tool and runtime-context types.',
  );
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
