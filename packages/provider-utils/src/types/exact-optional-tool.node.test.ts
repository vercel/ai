import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { expect, it } from 'vitest';

it('accepts outputless tools through public declarations with exact optional properties', () => {
  const fixturePath = fileURLToPath(
    new URL('./__fixtures__/exact-optional-tool.ts', import.meta.url),
  );
  const options: ts.CompilerOptions = {
    strict: true,
    exactOptionalPropertyTypes: true,
    noUncheckedIndexedAccess: true,
    skipLibCheck: false,
    noEmit: true,
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    types: ['node'],
  };
  const host = ts.createCompilerHost(options);
  const readFile = host.readFile;
  host.readFile = fileName =>
    readFile(fileName === fixturePath ? `${fixturePath}.txt` : fileName);

  const program = ts.createProgram({
    rootNames: [fixturePath],
    options,
    host,
  });
  const diagnostics = ts.getPreEmitDiagnostics(program);

  expect(
    diagnostics.map(diagnostic =>
      ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
    ),
  ).toEqual([]);
});
