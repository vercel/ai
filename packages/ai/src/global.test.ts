import { describe, expect, it } from 'vitest';

const isEdgeRuntime =
  (globalThis as { EdgeRuntime?: unknown }).EdgeRuntime !== undefined;

describe.skipIf(isEdgeRuntime)('global declaration compatibility', () => {
  it.each(
    [[], ['v7'], ['v6'], ['v5'], ['v5', 'v6']].map(versions => ({ versions })),
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
type ProviderV3 = { specificationVersion: 'v3' };
type ProviderV4 = { specificationVersion: 'v4' };
type LogWarningsFunction = (options: {
  warnings: Array<{ type: 'other'; message: string }>;
  provider?: string;
  model?: string;
}) => void;
type Telemetry = { onEnd?: (event: { version: 'v7' }) => void };
`;
      const files = new Map<string, string>([
        [path.resolve('test/v7-globals.d.ts'), currentTypes + declarations],
      ]);

      for (const [index, version] of versions.entries()) {
        const isV5 = version === 'v5';
        files.set(
          path.resolve(`test/other-${index}-globals.d.ts`),
          version === 'v7'
            ? currentTypes.replace(
                "type ProviderV4 = { specificationVersion: 'v4' };",
                "type ProviderV4 = { specificationVersion: 'v4'; copy?: true };",
              ) + declarations
            : `
export {};
declare const key: unique symbol;
type Warning = { type: 'other'; message: string };
declare global {
  interface AISDKGlobalTypes {
    [key]: {
      provider: { specificationVersion: '${isV5 ? 'v2' : 'v3'}' };
      logWarnings: ${isV5 ? '(warnings: Warning[]) => void' : '(options: { warnings: Warning[]; provider?: string; model?: string }) => void'};
      telemetry: ${isV5 ? 'never' : "{ onEnd?: (event: { version: 'v6' }) => void }"};
    };
  }
  var AI_SDK_DEFAULT_PROVIDER: AISDKGlobalTypes[keyof AISDKGlobalTypes]['provider'] | undefined;
  var AI_SDK_LOG_WARNINGS: AISDKGlobalTypes[keyof AISDKGlobalTypes]['logWarnings'] | undefined | false;
  ${isV5 ? '' : "var AI_SDK_TELEMETRY_INTEGRATIONS: Array<AISDKGlobalTypes[keyof AISDKGlobalTypes]['telemetry']> | undefined;"}
}
`,
        );
      }

      files.set(
        path.resolve('test/global-assignments.ts'),
        `
globalThis.AI_SDK_DEFAULT_PROVIDER = { specificationVersion: 'v4' };
// @ts-expect-error Invalid providers remain rejected.
globalThis.AI_SDK_DEFAULT_PROVIDER = { specificationVersion: 'invalid' };
const logger = (options: { warnings: Array<{ type: 'other'; message: string }> }) => {};
globalThis.AI_SDK_LOG_WARNINGS = logger;
globalThis.AI_SDK_LOG_WARNINGS = false;
// @ts-expect-error Only callbacks, false, or undefined are accepted.
globalThis.AI_SDK_LOG_WARNINGS = true;
globalThis.AI_SDK_TELEMETRY_INTEGRATIONS = [{ onEnd: (event: { version: 'v7' }) => {} }];
// @ts-expect-error Invalid telemetry remains rejected.
globalThis.AI_SDK_TELEMETRY_INTEGRATIONS = [false];
${versions.includes('v5') ? "globalThis.AI_SDK_LOG_WARNINGS = (warnings: Array<{ type: 'other'; message: string }>) => {};" : ''}
${
  versions.length === 0
    ? `
globalThis.AI_SDK_LOG_WARNINGS = ({ warnings, provider, model }) => {
  const message: string = warnings[0].message;
  // @ts-expect-error Warning options retain their contextual types.
  const invalid: number = warnings[0].message;
};
`
    : ''
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
