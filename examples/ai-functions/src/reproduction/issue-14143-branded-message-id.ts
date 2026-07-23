import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(scriptDirectory, '../../../..');
const virtualFile = path.join(scriptDirectory, 'issue-14143-case.ts');

const compilerOptions: ts.CompilerOptions = {
  baseUrl: workspaceRoot,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  noEmit: true,
  paths: {
    '@ai-sdk/react': ['packages/react/dist/index.d.ts'],
  },
  skipLibCheck: true,
  strict: true,
  target: ts.ScriptTarget.ES2022,
};

const sharedSource = `
import { useChat } from '@ai-sdk/react';
import type {
  UIDataTypes,
  UIMessage as AiUIMessage,
  UITools,
} from 'ai';
import { z } from 'zod';

declare const messageIdBrand: unique symbol;
type MessageId = string & { readonly [messageIdBrand]: true };

type BrandedUIMessage<
  METADATA = unknown,
  DATA_PARTS extends UIDataTypes = UIDataTypes,
  TOOLS extends UITools = UITools,
> = AiUIMessage<METADATA, DATA_PARTS, TOOLS> & {
  id: MessageId;
};

const someDataSchemas = {} satisfies UIDataTypes;
`;

const cases = {
  'standard message with nullish metadata': `
${sharedSource}
const metadataSchema = z.object({ value: z.string() }).nullish();
type SomeUIMessage = AiUIMessage<
  z.infer<typeof metadataSchema>,
  typeof someDataSchemas
>;

useChat<SomeUIMessage>({
  dataPartSchemas: someDataSchemas,
  messageMetadataSchema: metadataSchema,
});
`,
  'branded message with required metadata': `
${sharedSource}
const metadataSchema = z.object({ value: z.string() });
type SomeUIMessage = BrandedUIMessage<
  z.infer<typeof metadataSchema>,
  typeof someDataSchemas
>;

useChat<SomeUIMessage>({
  dataPartSchemas: someDataSchemas,
  messageMetadataSchema: metadataSchema,
});
`,
  'branded message with nullish metadata': `
${sharedSource}
const metadataSchema = z.object({ value: z.string() }).nullish();
type SomeUIMessage = BrandedUIMessage<
  z.infer<typeof metadataSchema>,
  typeof someDataSchemas
>;

useChat<SomeUIMessage>({
  dataPartSchemas: someDataSchemas,
  messageMetadataSchema: metadataSchema,
});
`,
} as const;

function getDiagnostics(source: string): readonly ts.Diagnostic[] {
  const defaultHost = ts.createCompilerHost(compilerOptions);
  const host: ts.CompilerHost = {
    ...defaultHost,
    fileExists: fileName =>
      path.resolve(fileName) === virtualFile ||
      defaultHost.fileExists(fileName),
    getSourceFile: (fileName, languageVersionOrOptions) => {
      if (path.resolve(fileName) === virtualFile) {
        return ts.createSourceFile(
          fileName,
          source,
          languageVersionOrOptions,
          true,
        );
      }

      return defaultHost.getSourceFile(fileName, languageVersionOrOptions);
    },
    readFile: fileName =>
      path.resolve(fileName) === virtualFile
        ? source
        : defaultHost.readFile(fileName),
  };

  return ts.getPreEmitDiagnostics(
    ts.createProgram([virtualFile], compilerOptions, host),
  );
}

function formatDiagnostics(diagnostics: readonly ts.Diagnostic[]): string {
  return ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: fileName => fileName,
    getCurrentDirectory: () => workspaceRoot,
    getNewLine: () => '\n',
  });
}

async function main() {
  const standardDiagnostics = getDiagnostics(
    cases['standard message with nullish metadata'],
  );
  const requiredDiagnostics = getDiagnostics(
    cases['branded message with required metadata'],
  );

  if (standardDiagnostics.length > 0 || requiredDiagnostics.length > 0) {
    console.error('Issue #14143 reproduction controls failed unexpectedly.');
    console.error(
      formatDiagnostics([...standardDiagnostics, ...requiredDiagnostics]),
    );
    process.exitCode = 2;
    return;
  }

  const reportedCaseDiagnostics = getDiagnostics(
    cases['branded message with nullish metadata'],
  );

  if (reportedCaseDiagnostics.length === 0) {
    console.log(
      'Issue #14143 could not be reproduced: useChat accepts a branded UIMessage id with a nullish messageMetadataSchema.',
    );
    return;
  }

  console.error(
    'Issue #14143 reproduced: branded UIMessage rejects nullish messageMetadataSchema.',
  );
  console.error(formatDiagnostics(reportedCaseDiagnostics));
  process.exitCode = 1;
}

await main();
