import { describe, expect, it } from 'vitest';

const isEdgeRuntime =
  (globalThis as { EdgeRuntime?: unknown }).EdgeRuntime !== undefined;

describe.skipIf(isEdgeRuntime)('Output declaration emit', () => {
  it('emits declarations for exported values with inferred output types', async () => {
    const [{ default: path }, { default: ts }] = await Promise.all([
      import('node:path'),
      import('typescript'),
    ]);
    const compilerOptions = {
      declaration: true,
      emitDeclarationOnly: true,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      skipLibCheck: true,
      strict: true,
      target: ts.ScriptTarget.ES2022,
      types: [],
    };
    const fileName = path.resolve('test/exported-output.ts');
    const sourceText = `
import { Output, type Prompt } from 'ai';

export const aiUtils = {
  acceptPrompt: (prompt: Prompt) => prompt,
  textOutput: Output.text(),
};
`;
    const host = ts.createCompilerHost(compilerOptions);
    const fileExists = host.fileExists.bind(host);
    const getSourceFile = host.getSourceFile.bind(host);
    const readFile = host.readFile.bind(host);
    let declaration = '';

    host.fileExists = candidate =>
      candidate === fileName || fileExists(candidate);
    host.getSourceFile = (candidate, languageVersion, ...rest) =>
      candidate === fileName
        ? ts.createSourceFile(candidate, sourceText, languageVersion, true)
        : getSourceFile(candidate, languageVersion, ...rest);
    host.readFile = candidate =>
      candidate === fileName ? sourceText : readFile(candidate);
    host.writeFile = (outputFileName, text) => {
      if (outputFileName.endsWith('.d.ts')) {
        declaration = text;
      }
    };

    const program = ts.createProgram({
      rootNames: [fileName],
      options: compilerOptions,
      host,
    });
    const emitResult = program.emit();
    const diagnostics = [
      ...ts.getPreEmitDiagnostics(program),
      ...emitResult.diagnostics,
    ];

    expect(
      diagnostics.map(
        diagnostic =>
          `TS${diagnostic.code}: ${ts.flattenDiagnosticMessageText(
            diagnostic.messageText,
            '\n',
          )}`,
      ),
    ).toEqual([]);
    expect(declaration).toContain('export declare const aiUtils');
    expect(declaration).toContain('textOutput:');
  });
});
