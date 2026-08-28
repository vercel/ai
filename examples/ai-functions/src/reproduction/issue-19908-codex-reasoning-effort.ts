import path from 'node:path';
import ts from 'typescript';

const supportedEfforts = ['xhigh', 'max'] as const;

function publicTypeAccepts(effort: (typeof supportedEfforts)[number]) {
  const virtualFileName = path.resolve(
    import.meta.dirname,
    `issue-19908-${effort}-type-check.ts`,
  );
  const source = `
    import { createCodex } from '@ai-sdk/harness-codex';
    createCodex({ reasoningEffort: '${effort}' });
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
  const host = ts.createCompilerHost(compilerOptions);
  const defaultFileExists = host.fileExists.bind(host);
  const defaultGetSourceFile = host.getSourceFile.bind(host);
  const defaultReadFile = host.readFile.bind(host);

  host.fileExists = fileName =>
    fileName === virtualFileName || defaultFileExists(fileName);
  host.readFile = fileName =>
    fileName === virtualFileName ? source : defaultReadFile(fileName);
  host.getSourceFile = (fileName, languageVersion, onError) =>
    fileName === virtualFileName
      ? ts.createSourceFile(fileName, source, languageVersion, true)
      : defaultGetSourceFile(fileName, languageVersion, onError);

  const program = ts.createProgram([virtualFileName], compilerOptions, host);
  const diagnostics = ts
    .getPreEmitDiagnostics(program)
    .filter(diagnostic => diagnostic.file?.fileName === virtualFileName);

  if (diagnostics.length === 0) {
    return true;
  }

  const expectedRejection = diagnostics.every(
    diagnostic =>
      (diagnostic.code === 2322 || diagnostic.code === 2820) &&
      ts
        .flattenDiagnosticMessageText(diagnostic.messageText, '\n')
        .includes(`"${effort}"`),
  );
  if (!expectedRejection) {
    throw new Error(
      `Unexpected TypeScript diagnostics for ${effort}: ${diagnostics
        .map(diagnostic =>
          ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
        )
        .join(' | ')}`,
    );
  }

  return false;
}

async function main() {
  const protocolModuleUrl = new URL(
    '../../../../packages/harness-codex/src/codex-bridge-protocol.ts',
    import.meta.url,
  );
  const { startMessageSchema } = await import(protocolModuleUrl.href);

  const publicTypeRejected = supportedEfforts.filter(
    effort => !publicTypeAccepts(effort),
  );
  const bridgeSchemaRejected = supportedEfforts.filter(
    effort =>
      !startMessageSchema.safeParse({
        type: 'start',
        prompt: 'Test supported Codex reasoning effort.',
        reasoningEffort: effort,
      }).success,
  );

  if (publicTypeRejected.length > 0 || bridgeSchemaRejected.length > 0) {
    console.error(
      `Issue #19908 reproduced: public type rejected ${publicTypeRejected.join(
        ',',
      )}; bridge schema rejected ${bridgeSchemaRejected.join(',')}`,
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    'Codex harness public type and bridge schema accept xhigh and max.',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
