import { describe, expect, it } from 'vitest';

const isEdgeRuntime =
  (globalThis as { EdgeRuntime?: unknown }).EdgeRuntime !== undefined;

describe.skipIf(isEdgeRuntime)('global declaration compatibility', () => {
  it.each(
    [[], ['v5'], ['v6'], ['v7'], ['v6', 'v7']].map(versions => ({ versions })),
  )(
    'type-checks alongside patched versions $versions',
    async ({ versions }) => {
      const [{ readFile }, { default: path }, { default: ts }] =
        await Promise.all([
          import('node:fs/promises'),
          import('node:path'),
          import('typescript'),
        ]);
      const source = ts.createSourceFile(
        'global.ts',
        await readFile(new URL('./global.ts', import.meta.url), 'utf8'),
        ts.ScriptTarget.ES2022,
        true,
      );
      const printer = ts.createPrinter();
      // Check the actual global declarations with small, distinct model types.
      // This isolates declaration merging from unrelated SDK implementation code.
      const declarations = source.statements
        .filter(statement => !ts.isImportDeclaration(statement))
        .map(statement =>
          printer.printNode(ts.EmitHint.Unspecified, statement, source),
        )
        .join('\n');
      const currentTypes = `
export {};
type ProviderV2 = { specificationVersion: 'v2' };
type LogWarningsFunction = (warnings: Array<{ type: 'other'; message: string }>) => void;
`;
      const files = new Map<string, string>([
        [path.resolve('test/v5-globals.d.ts'), currentTypes + declarations],
      ]);

      for (const [index, version] of versions.entries()) {
        files.set(
          path.resolve(`test/other-${index}-globals.d.ts`),
          version === 'v5'
            ? currentTypes + declarations
            : `
export {};
declare const key: unique symbol;
type Warning = { type: 'other'; message: string };
declare global {
  interface AISDKGlobalTypes {
    [key]: {
      provider: { specificationVersion: '${version === 'v6' ? 'v3' : 'v4'}' };
      logWarnings: (options: { warnings: Warning[]; provider?: string; model?: string }) => void;
      telemetry: { onEnd?: (event: { version: '${version}' }) => void };
    };
  }
  var AI_SDK_DEFAULT_PROVIDER: AISDKGlobalTypes[keyof AISDKGlobalTypes]['provider'] | undefined;
  var AI_SDK_LOG_WARNINGS: AISDKGlobalTypes[keyof AISDKGlobalTypes]['logWarnings'] | undefined | false;
  var AI_SDK_TELEMETRY_INTEGRATIONS: Array<AISDKGlobalTypes[keyof AISDKGlobalTypes]['telemetry']> | undefined;
}
`,
        );
      }

      const otherMajors = versions.filter(version => version !== 'v5');
      files.set(
        path.resolve('test/global-assignments.ts'),
        `
globalThis.AI_SDK_DEFAULT_PROVIDER = { specificationVersion: 'v2' };
globalThis.AI_SDK_DEFAULT_PROVIDER = undefined;
// @ts-expect-error Invalid providers remain rejected.
globalThis.AI_SDK_DEFAULT_PROVIDER = { specificationVersion: 'invalid' };
const logger = (warnings: Array<{ type: 'other'; message: string }>) => {};
globalThis.AI_SDK_LOG_WARNINGS = logger;
globalThis.AI_SDK_LOG_WARNINGS = false;
globalThis.AI_SDK_LOG_WARNINGS = undefined;
// @ts-expect-error Only callbacks, false, or undefined are accepted.
globalThis.AI_SDK_LOG_WARNINGS = true;
// @ts-expect-error Invalid callback arguments remain rejected.
globalThis.AI_SDK_LOG_WARNINGS = (warnings: number[]) => {};
${otherMajors
  .map(
    version => `
globalThis.AI_SDK_DEFAULT_PROVIDER = { specificationVersion: '${version === 'v6' ? 'v3' : 'v4'}' };
globalThis.AI_SDK_LOG_WARNINGS = (options: { warnings: Array<{ type: 'other'; message: string }> }) => {};
globalThis.AI_SDK_TELEMETRY_INTEGRATIONS = [{ onEnd: (event: { version: '${version}' }) => {} }];
`,
  )
  .join('\n')}
${
  otherMajors.length === 0
    ? `
globalThis.AI_SDK_LOG_WARNINGS = warnings => {
  const message: string = warnings[0].message;
  // @ts-expect-error Warnings retain their contextual types.
  const invalid: number = warnings[0].message;
};
// @ts-expect-error v5 does not introduce a telemetry global.
globalThis.AI_SDK_TELEMETRY_INTEGRATIONS = [];
// @ts-expect-error v5 contributes no telemetry types.
const telemetry: AISDKGlobalTypes[keyof AISDKGlobalTypes]['telemetry'] = {};
`
    : `
globalThis.AI_SDK_TELEMETRY_INTEGRATIONS = undefined;
// @ts-expect-error Invalid telemetry remains rejected.
globalThis.AI_SDK_TELEMETRY_INTEGRATIONS = [false];
`
}
`,
      );

      const compilerOptions = {
        noEmit: true,
        skipLibCheck: false,
        strict: true,
        target: ts.ScriptTarget.ES2022,
        types: [],
      };
      const host = ts.createCompilerHost(compilerOptions);
      const getSourceFile = host.getSourceFile.bind(host);
      host.getSourceFile = (candidate, languageVersion, ...rest) => {
        const sourceText = files.get(candidate);
        return sourceText === undefined
          ? getSourceFile(candidate, languageVersion, ...rest)
          : ts.createSourceFile(candidate, sourceText, languageVersion, true);
      };
      const program = ts.createProgram({
        rootNames: [...files.keys()],
        options: compilerOptions,
        host,
      });

      expect(
        ts
          .getPreEmitDiagnostics(program)
          .map(
            diagnostic =>
              `TS${diagnostic.code}: ${ts.flattenDiagnosticMessageText(
                diagnostic.messageText,
                '\n',
              )}`,
          ),
      ).toEqual([]);
    },
  );
});
