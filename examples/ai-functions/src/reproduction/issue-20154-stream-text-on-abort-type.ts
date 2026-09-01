import { rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const reproductionSource = `
import { streamText } from '../../../../packages/ai/src/index.ts';

streamText({
  model: 'test-provider/test-model',
  prompt: 'test',
  onAbort: event => {
    const callId: string = event.callId;
    const reason: unknown = event.reason;
    void callId;
    void reason;
  },
});
`;

async function main() {
  const directory = dirname(fileURLToPath(import.meta.url));
  const temporarySourcePath = join(directory, '.issue-20154-typecheck.ts');

  await writeFile(temporarySourcePath, reproductionSource);

  try {
    const program = ts.createProgram({
      rootNames: [temporarySourcePath],
      options: {
        allowImportingTsExtensions: true,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        noEmit: true,
        skipLibCheck: true,
        strict: true,
        target: ts.ScriptTarget.ES2022,
      },
    });
    const diagnostics = ts.getPreEmitDiagnostics(program);
    const messages = diagnostics.map(diagnostic =>
      ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
    );

    const callIdMissing = messages.some(message =>
      message.includes("Property 'callId' does not exist on type"),
    );
    const reasonMissing = messages.some(message =>
      message.includes("Property 'reason' does not exist on type"),
    );

    if (callIdMissing && reasonMissing) {
      console.error(
        'ISSUE_20154_REPRODUCED: streamText onAbort event type omits callId and reason',
      );
      process.exitCode = 1;
      return;
    }

    if (diagnostics.length > 0) {
      console.error(
        ts.formatDiagnosticsWithColorAndContext(diagnostics, {
          getCanonicalFileName: fileName => fileName,
          getCurrentDirectory: () => process.cwd(),
          getNewLine: () => '\n',
        }),
      );
      process.exitCode = 2;
      return;
    }

    console.log(
      'ISSUE_20154_FIXED: streamText onAbort exposes callId and reason',
    );
  } finally {
    await rm(temporarySourcePath, { force: true });
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 2;
});
