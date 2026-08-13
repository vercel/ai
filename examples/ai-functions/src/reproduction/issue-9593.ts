import path from 'node:path';
import ts from 'typescript';

const compilerOptions: ts.CompilerOptions = {
  declaration: true,
  emitDeclarationOnly: true,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  skipLibCheck: true,
  strict: true,
  target: ts.ScriptTarget.ES2022,
  types: [],
};

function getDeclarationDiagnostics(
  fileName: string,
  sourceText: string,
): ts.Diagnostic[] {
  const virtualFilePath = path.resolve('src/reproduction', fileName);
  const host = ts.createCompilerHost(compilerOptions);
  const defaultFileExists = host.fileExists.bind(host);
  const defaultGetSourceFile = host.getSourceFile.bind(host);
  const defaultReadFile = host.readFile.bind(host);

  host.fileExists = candidate =>
    candidate === virtualFilePath || defaultFileExists(candidate);
  host.getSourceFile = (candidate, languageVersion, ...rest) =>
    candidate === virtualFilePath
      ? ts.createSourceFile(candidate, sourceText, languageVersion, true)
      : defaultGetSourceFile(candidate, languageVersion, ...rest);
  host.readFile = candidate =>
    candidate === virtualFilePath ? sourceText : defaultReadFile(candidate);
  host.writeFile = () => {};

  const program = ts.createProgram({
    rootNames: [virtualFilePath],
    options: compilerOptions,
    host,
  });
  const emitResult = program.emit();
  const diagnostics = [
    ...ts.getPreEmitDiagnostics(program),
    ...emitResult.diagnostics,
  ];

  return diagnostics.filter(
    (diagnostic, index) =>
      diagnostics.findIndex(
        candidate =>
          candidate.code === diagnostic.code &&
          candidate.file?.fileName === diagnostic.file?.fileName &&
          candidate.start === diagnostic.start &&
          ts.flattenDiagnosticMessageText(candidate.messageText, '\n') ===
            ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
      ) === index,
  );
}

function formatDiagnostic(diagnostic: ts.Diagnostic): string {
  return `TS${diagnostic.code}: ${ts.flattenDiagnosticMessageText(
    diagnostic.messageText,
    '\n',
  )}`;
}

async function main() {
  const promptOnlyDiagnostics = getDeclarationDiagnostics(
    'issue-9593-prompt-control.ts',
    `
import type { Prompt } from 'ai';

export const aiUtils = {
  acceptPrompt: (prompt: Prompt) => prompt,
};
`,
  );

  if (promptOnlyDiagnostics.length > 0) {
    throw new Error(
      `Prompt control failed unexpectedly:\n${promptOnlyDiagnostics
        .map(formatDiagnostic)
        .join('\n')}`,
    );
  }

  const diagnostics = getDeclarationDiagnostics(
    'issue-9593-fixture.ts',
    `
import { Output, type Prompt } from 'ai';

export const aiUtils = {
  acceptPrompt: (prompt: Prompt) => prompt,
  textOutput: Output.text(),
};
`,
  );
  const reportedDiagnostic = diagnostics.find(
    diagnostic =>
      diagnostic.code === 4023 &&
      ts
        .flattenDiagnosticMessageText(diagnostic.messageText, '\n')
        .includes("Exported variable 'aiUtils' has or is using name 'Output'"),
  );

  if (reportedDiagnostic !== undefined) {
    console.error(
      'ISSUE #9593 REPRODUCED: declaration emit reports TS4023 for exported aiUtils',
    );
    console.error(formatDiagnostic(reportedDiagnostic));
    process.exitCode = 1;
    return;
  }

  if (diagnostics.length > 0) {
    throw new Error(
      `Declaration emit failed for an unrelated reason:\n${diagnostics
        .map(formatDiagnostic)
        .join('\n')}`,
    );
  }

  console.log('Issue #9593 did not reproduce: declaration emit succeeded.');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
