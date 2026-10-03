import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import ts from 'typescript';

const expectedBehavior =
  'Importing the current ai package with an older major must type-check when skipLibCheck is false.';

const scenarios = [
  {
    label: 'ai@7.0.127 with ai@6.0.300',
    olderPackage: 'ai6',
  },
  {
    label: 'ai@7.0.127 with ai@5.0.271',
    olderPackage: 'ai5',
  },
] as const;

async function main() {
  const temporaryDirectory = await mkdtemp(
    join(process.cwd(), '.issue-21999-'),
  );

  try {
    const conflicts: string[] = [];

    for (const scenario of scenarios) {
      const probePath = join(
        temporaryDirectory,
        `${scenario.olderPackage}-probe.ts`,
      );

      await writeFile(
        probePath,
        [
          "import type { generateText } from 'ai';",
          `import type { generateText as olderGenerateText } from '${scenario.olderPackage}';`,
          'export type CurrentGenerateText = typeof generateText;',
          'export type OlderGenerateText = typeof olderGenerateText;',
        ].join('\n'),
      );

      const program = ts.createProgram({
        rootNames: [probePath],
        options: {
          module: ts.ModuleKind.NodeNext,
          moduleResolution: ts.ModuleResolutionKind.NodeNext,
          noEmit: true,
          skipLibCheck: false,
          strict: true,
          target: ts.ScriptTarget.ES2022,
          types: ['node'],
        },
      });
      const diagnostics = ts.getPreEmitDiagnostics(program);
      const unexpectedDiagnostics = diagnostics.filter(
        diagnostic => diagnostic.code !== 2403,
      );

      if (unexpectedDiagnostics.length > 0) {
        throw new Error(
          `Reproduction setup failed for ${scenario.label}:\n${ts.formatDiagnosticsWithColorAndContext(
            unexpectedDiagnostics,
            {
              getCanonicalFileName: fileName => fileName,
              getCurrentDirectory: () => process.cwd(),
              getNewLine: () => '\n',
            },
          )}`,
        );
      }

      const globalConflicts = diagnostics.filter(
        diagnostic =>
          diagnostic.code === 2403 &&
          /AI_SDK_(DEFAULT_PROVIDER|LOG_WARNINGS|TELEMETRY_INTEGRATIONS)/.test(
            ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
          ),
      );

      if (globalConflicts.length > 0) {
        conflicts.push(
          `${scenario.label}: ${globalConflicts
            .map(diagnostic =>
              ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
            )
            .join(' | ')}`,
        );
      }
    }

    if (conflicts.length > 0) {
      console.error(conflicts.join('\n'));
      throw new Error(
        `Issue #21999 reproduced: ${expectedBehavior} TypeScript reported TS2403 for AI_SDK_* globals.`,
      );
    }

    console.log(expectedBehavior);
  } finally {
    await rm(temporaryDirectory, { force: true, recursive: true });
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
