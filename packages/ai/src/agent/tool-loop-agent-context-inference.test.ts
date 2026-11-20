import { describe, expect, it } from 'vitest';

const isEdgeRuntime =
  (globalThis as { EdgeRuntime?: unknown }).EdgeRuntime !== undefined;

async function checkWithStrictFunctionTypesDisabled(sourceText: string) {
  const [{ default: path }, { default: ts }] = await Promise.all([
    import('node:path'),
    import('typescript'),
  ]);

  const compilerOptions = {
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    noEmit: true,
    noImplicitAny: true,
    paths: {
      ai: [path.resolve('src/index.ts')],
      '@ai-sdk/provider-utils': [
        path.resolve('../provider-utils/src/index.ts'),
      ],
      '@ai-sdk/provider': [path.resolve('../provider/src/index.ts')],
      '@ai-sdk/gateway': [path.resolve('../gateway/src/index.ts')],
    },
    skipLibCheck: true,
    strictFunctionTypes: false,
    strictNullChecks: true,
    target: ts.ScriptTarget.ES2023,
    types: ['@types/node'],
  };

  const fileName = path.resolve('src/agent/repro-tools-context.ts');
  const host = ts.createCompilerHost(compilerOptions);
  const fileExists = host.fileExists.bind(host);
  const getSourceFile = host.getSourceFile.bind(host);
  const readFile = host.readFile.bind(host);

  host.fileExists = candidate =>
    candidate === fileName || fileExists(candidate);
  host.getSourceFile = (candidate, languageVersion, ...rest) =>
    candidate === fileName
      ? ts.createSourceFile(candidate, sourceText, languageVersion, true)
      : getSourceFile(candidate, languageVersion, ...rest);
  host.readFile = candidate =>
    candidate === fileName ? sourceText : readFile(candidate);

  const program = ts.createProgram({
    rootNames: [fileName],
    options: compilerOptions,
    host,
  });

  return ts
    .getPreEmitDiagnostics(program, program.getSourceFile(fileName))
    .map(
      diagnostic =>
        `TS${diagnostic.code}: ${ts.flattenDiagnosticMessageText(
          diagnostic.messageText,
          '\n',
        )}`,
    );
}

describe.skipIf(isEdgeRuntime)(
  'ToolLoopAgent toolsContext inference without strictFunctionTypes',
  () => {
    it('accepts toolsContext for a tool with contextSchema and unannotated toModelOutput', async () => {
      const diagnostics = await checkWithStrictFunctionTypesDisabled(`
import { ToolLoopAgent, tool, type LanguageModel } from 'ai';
import { z } from 'zod/v4';

declare const model: LanguageModel;

const myTool = tool({
  inputSchema: z.object({ query: z.string() }),
  outputSchema: z.object({ result: z.string() }),
  contextSchema: z.object({ userId: z.string() }),
  toModelOutput: ({ output }) => ({ type: 'text', value: output.result }),
  execute: async (_input, { context }) => ({ result: context.userId }),
});

export const agent = new ToolLoopAgent({
  model,
  tools: { myTool },
  toolsContext: { myTool: { userId: 'u1' } },
});
`);

      expect(diagnostics).toEqual([]);
    });

    it('still rejects invalid toolsContext when strictFunctionTypes is disabled', async () => {
      const diagnostics = await checkWithStrictFunctionTypesDisabled(`
import { ToolLoopAgent, tool, type LanguageModel } from 'ai';
import { z } from 'zod/v4';

declare const model: LanguageModel;

const myTool = tool({
  inputSchema: z.object({ query: z.string() }),
  outputSchema: z.object({ result: z.string() }),
  contextSchema: z.object({ userId: z.string() }),
  toModelOutput: ({ output }) => ({ type: 'text', value: output.result }),
  execute: async (_input, { context }) => ({ result: context.userId }),
});

export const agent = new ToolLoopAgent({
  model,
  tools: { myTool },
  toolsContext: { myTool: { userId: 123 } },
});
`);

      expect(
        diagnostics.some(
          d => d.startsWith('TS2322:') || d.startsWith('TS2345:'),
        ),
      ).toBe(true);
    });
  },
);
