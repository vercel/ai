import { writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const failureSignal =
  'ISSUE 13438 REPRODUCED: a ProviderV3 implementation without rerankingModel is not assignable to Provider';

async function main() {
  const reproductionDirectory = path.dirname(fileURLToPath(import.meta.url));
  const fixturePath = path.join(
    reproductionDirectory,
    '.issue-13438-provider-assignment.ts',
  );

  await writeFile(
    fixturePath,
    `
import { createOpenResponses } from '@ai-sdk/open-responses';
import type { Provider } from 'ai';

const provider: Provider = createOpenResponses({
  name: 'test',
  url: 'http://localhost/v1/responses',
});

void provider;
`,
  );

  try {
    const program = ts.createProgram([fixturePath], {
      esModuleInterop: true,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      noEmit: true,
      skipLibCheck: true,
      strict: true,
      target: ts.ScriptTarget.ES2022,
    });
    const diagnostics = ts.getPreEmitDiagnostics(program);
    const assignmentDiagnostics = diagnostics.filter(
      diagnostic =>
        diagnostic.code === 2322 &&
        diagnostic.file?.fileName === fixturePath &&
        ts
          .flattenDiagnosticMessageText(diagnostic.messageText, '\n')
          .includes('rerankingModel'),
    );

    if (assignmentDiagnostics.length > 0) {
      console.error(failureSignal);
      process.exitCode = 1;
      return;
    }

    if (diagnostics.length > 0) {
      throw new Error(
        `Unexpected TypeScript diagnostics:\n${ts.formatDiagnosticsWithColorAndContext(
          diagnostics,
          {
            getCanonicalFileName: fileName => fileName,
            getCurrentDirectory: () => process.cwd(),
            getNewLine: () => '\n',
          },
        )}`,
      );
    }

    console.log(
      'ProviderV3 implementation is assignable to Provider without rerankingModel.',
    );
  } finally {
    await unlink(fixturePath);
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
