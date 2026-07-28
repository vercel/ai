import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const fixtureSource = `
import { tool } from 'ai';
import { z } from 'zod';

tool({
  inputSchema: z.object({
    data: z.string(),
  }),
  execute(args) {},
});
`;

async function main() {
  const fixturePath = fileURLToPath(
    new URL('./issue-18053-virtual-fixture.ts', import.meta.url),
  );
  const compilerOptions: ts.CompilerOptions = {
    allowSyntheticDefaultImports: true,
    esModuleInterop: true,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    noEmit: true,
    skipLibCheck: true,
    strict: true,
    target: ts.ScriptTarget.ES2022,
  };
  const host = ts.createCompilerHost(compilerOptions, true);
  const fileExists = host.fileExists.bind(host);
  const getSourceFile = host.getSourceFile.bind(host);
  const readFile = host.readFile.bind(host);

  host.fileExists = fileName =>
    fileName === fixturePath || fileExists(fileName);
  host.readFile = fileName =>
    fileName === fixturePath ? fixtureSource : readFile(fileName);
  host.getSourceFile = (
    fileName,
    languageVersion,
    onError,
    shouldCreateNewSourceFile,
  ) =>
    fileName === fixturePath
      ? ts.createSourceFile(fileName, fixtureSource, languageVersion, true)
      : getSourceFile(
          fileName,
          languageVersion,
          onError,
          shouldCreateNewSourceFile,
        );

  const program = ts.createProgram([fixturePath], compilerOptions, host);
  const diagnostics = ts.getPreEmitDiagnostics(program);

  if (diagnostics.length > 0) {
    throw new Error(
      `Fixture did not type-check:\n${ts.formatDiagnosticsWithColorAndContext(
        diagnostics,
        host,
      )}`,
    );
  }

  const sourceFile = program.getSourceFile(fixturePath);
  if (sourceFile == null) {
    throw new Error('Virtual fixture source file was not created.');
  }

  let executeInput: ts.ParameterDeclaration | undefined;

  function visit(node: ts.Node) {
    if (
      ts.isMethodDeclaration(node) &&
      node.name.getText(sourceFile) === 'execute'
    ) {
      executeInput = node.parameters[0];
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  if (executeInput == null) {
    throw new Error('Could not find the execute callback parameter.');
  }

  const checker = program.getTypeChecker();
  const inputType = checker.getTypeAtLocation(executeInput);
  const actualType = checker.typeToString(
    inputType,
    executeInput,
    ts.TypeFormatFlags.NoTruncation,
  );

  if ((inputType.flags & ts.TypeFlags.Any) !== 0) {
    throw new Error(
      'Issue #18053 reproduced: execute args inferred as any; expected { data: string; }.',
    );
  }

  if (actualType !== '{ data: string; }') {
    throw new Error(
      `Issue #18053 reproduced with an unexpected execute args type: ${actualType}; expected { data: string; }.`,
    );
  }

  console.log(
    'Issue #18053 could not be reproduced: execute args inferred as { data: string; } (not any).',
  );
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
