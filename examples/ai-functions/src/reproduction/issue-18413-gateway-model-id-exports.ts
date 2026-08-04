import path from 'node:path';
import ts from 'typescript';

async function main() {
  const sourcePath = path.resolve('issue-18413-consumer.ts');
  const sourceText = `
    import type {
      GatewayEmbeddingModelId,
      GatewayImageModelId,
      GatewayModelId,
    } from '@ai-sdk/gateway';

    type PublicGatewayModelIds = [
      GatewayModelId,
      GatewayEmbeddingModelId,
      GatewayImageModelId,
    ];
  `;
  const options: ts.CompilerOptions = {
    baseUrl: path.resolve('../..'),
    esModuleInterop: true,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    noEmit: true,
    paths: {
      '@ai-sdk/gateway': ['packages/gateway'],
    },
    skipLibCheck: true,
    strict: true,
    target: ts.ScriptTarget.ES2022,
  };
  const host = ts.createCompilerHost(options);
  const defaultFileExists = host.fileExists.bind(host);
  const defaultGetSourceFile = host.getSourceFile.bind(host);
  const defaultReadFile = host.readFile.bind(host);

  host.fileExists = fileName =>
    fileName === sourcePath || defaultFileExists(fileName);
  host.readFile = fileName =>
    fileName === sourcePath ? sourceText : defaultReadFile(fileName);
  host.getSourceFile = (fileName, languageVersion, onError, shouldCreate) =>
    fileName === sourcePath
      ? ts.createSourceFile(fileName, sourceText, languageVersion, true)
      : defaultGetSourceFile(fileName, languageVersion, onError, shouldCreate);

  const program = ts.createProgram([sourcePath], options, host);

  const diagnostics = ts.getPreEmitDiagnostics(program);
  const missingExports = new Set(
    diagnostics
      .filter(diagnostic => [2305, 2459, 2724].includes(diagnostic.code))
      .map(diagnostic =>
        ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
      )
      .flatMap(message =>
        ['GatewayEmbeddingModelId', 'GatewayImageModelId'].filter(typeName =>
          message.includes(`'${typeName}'`),
        ),
      ),
  );

  if (
    missingExports.has('GatewayEmbeddingModelId') &&
    missingExports.has('GatewayImageModelId')
  ) {
    console.error(
      'Issue #18413 reproduced: @ai-sdk/gateway does not export GatewayEmbeddingModelId or GatewayImageModelId.',
    );
    process.exitCode = 1;
    return;
  }

  const formattedDiagnostics = ts.formatDiagnosticsWithColorAndContext(
    diagnostics,
    {
      getCanonicalFileName: fileName => fileName,
      getCurrentDirectory: process.cwd,
      getNewLine: () => '\n',
    },
  );

  throw new Error(
    `Expected missing-export diagnostics for both public imports.\n${formattedDiagnostics}`,
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
