import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const sharedSource = `
import { WorkflowAgent } from '@ai-sdk/workflow';
import { tool, type LanguageModel } from 'ai';
import { z } from 'zod';

const model = {} as LanguageModel;
const tools = {
  weather: tool({
    inputSchema: z.object({ city: z.string() }),
    execute: async () => 'sunny',
  }),
};
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

function typeCheck(source: string): readonly ts.Diagnostic[] {
  const probePath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    'issue-20075-type-probe.ts',
  );
  const defaultHost = ts.createCompilerHost(compilerOptions);
  const normalizedProbePath = path.normalize(probePath);
  const host: ts.CompilerHost = {
    ...defaultHost,
    fileExists: fileName =>
      path.normalize(fileName) === normalizedProbePath ||
      defaultHost.fileExists(fileName),
    getSourceFile: (
      fileName,
      languageVersion,
      onError,
      shouldCreateNewSourceFile,
    ) =>
      path.normalize(fileName) === normalizedProbePath
        ? ts.createSourceFile(fileName, source, languageVersion, true)
        : defaultHost.getSourceFile(
            fileName,
            languageVersion,
            onError,
            shouldCreateNewSourceFile,
          ),
    readFile: fileName =>
      path.normalize(fileName) === normalizedProbePath
        ? source
        : defaultHost.readFile(fileName),
  };

  return ts.getPreEmitDiagnostics(
    ts.createProgram({
      rootNames: [probePath],
      options: compilerOptions,
      host,
    }),
  );
}

function formatDiagnostics(diagnostics: readonly ts.Diagnostic[]): string {
  return ts.formatDiagnostics(diagnostics, {
    getCanonicalFileName: fileName => fileName,
    getCurrentDirectory: () => process.cwd(),
    getNewLine: () => '\n',
  });
}

function hasToolNameDiagnostic(diagnostics: readonly ts.Diagnostic[]): boolean {
  return diagnostics.some(diagnostic => {
    const message = ts.flattenDiagnosticMessageText(
      diagnostic.messageText,
      '\n',
    );
    return message.includes('weahter') && message.includes('weather');
  });
}

async function main() {
  const validPrepareStepDiagnostics = typeCheck(`
${sharedSource}

new WorkflowAgent({
  model,
  tools,
  prepareStep: () => ({
    activeTools: ['weather'],
  }),
});
`);

  if (validPrepareStepDiagnostics.length > 0) {
    throw new Error(
      `Valid prepareStep control did not type-check:\n${formatDiagnostics(
        validPrepareStepDiagnostics,
      )}`,
    );
  }

  const constructorDiagnostics = typeCheck(`
${sharedSource}

new WorkflowAgent({
  model,
  tools,
  activeTools: ['weahter'],
});
`);

  if (!hasToolNameDiagnostic(constructorDiagnostics)) {
    throw new Error(
      `Constructor activeTools control did not reject the invalid tool name:\n${formatDiagnostics(
        constructorDiagnostics,
      )}`,
    );
  }

  const streamDiagnostics = typeCheck(`
${sharedSource}

const agent = new WorkflowAgent({ model, tools });
void agent.stream({
  messages: [],
  activeTools: ['weahter'],
});
`);

  if (!hasToolNameDiagnostic(streamDiagnostics)) {
    throw new Error(
      `Stream activeTools control did not reject the invalid tool name:\n${formatDiagnostics(
        streamDiagnostics,
      )}`,
    );
  }

  const prepareStepDiagnostics = typeCheck(`
${sharedSource}

new WorkflowAgent({
  model,
  tools,
  prepareStep: () => ({
    activeTools: ['weahter'],
  }),
});
`);

  if (!hasToolNameDiagnostic(prepareStepDiagnostics)) {
    throw new Error(
      'Reproduced issue #20075: WorkflowAgent prepareStep activeTools accepted the nonexistent tool name "weahter".',
    );
  }

  console.log(
    'WorkflowAgent prepareStep activeTools rejected the nonexistent tool name.',
  );
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
