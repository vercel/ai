import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const issueSignal =
  'ISSUE_22177_REPRODUCED: documented per-call toolsContext is rejected by ToolLoopAgent types';

function documentsPerCallToolsContext(source: string): boolean {
  return /agent\.generate\(\{[\s\S]{0,1800}\btoolsContext\s*:/.test(source);
}

async function main() {
  const reproductionDirectory = dirname(fileURLToPath(import.meta.url));
  const repositoryRoot = resolve(reproductionDirectory, '../../../..');
  const documentationPaths = [
    'content/docs/03-ai-sdk-core/17-runtime-and-tool-context.mdx',
    'content/docs/03-agents/02-building-agents.mdx',
  ];
  const documentationSources = await Promise.all(
    documentationPaths.map(path =>
      readFile(resolve(repositoryRoot, path), 'utf8'),
    ),
  );

  if (!documentationSources.some(documentsPerCallToolsContext)) {
    console.log(
      'Issue #22177 is fixed: the documentation no longer instructs ToolLoopAgent callers to pass toolsContext per call.',
    );
    return;
  }

  const fixturePath = resolve(
    reproductionDirectory,
    'issue-22177-tool-context.fixture.ts',
  );
  const program = ts.createProgram({
    rootNames: [fixturePath],
    options: {
      allowSyntheticDefaultImports: true,
      esModuleInterop: true,
      lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'],
      module: ts.ModuleKind.Preserve,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      noEmit: true,
      skipLibCheck: true,
      strict: true,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const diagnostics = ts
    .getPreEmitDiagnostics(program)
    .filter(diagnostic => diagnostic.file?.fileName === fixturePath);

  if (diagnostics.length === 0) {
    console.log(
      'Issue #22177 is fixed: the documented generate() usage and equivalent stream() usage type-check.',
    );
    return;
  }

  const messages = diagnostics.map(diagnostic =>
    ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
  );
  const constructorRejectsOmission = messages.some(
    message =>
      message.includes("Property 'toolsContext' is missing") &&
      message.includes('ToolLoopAgentSettings'),
  );
  const callsRejectToolsContext =
    messages.filter(message =>
      message.includes("'toolsContext' does not exist"),
    ).length === 2;

  if (!constructorRejectsOmission || !callsRejectToolsContext) {
    throw new Error(
      `Unexpected TypeScript diagnostics:\n${ts.formatDiagnosticsWithColorAndContext(
        diagnostics,
        {
          getCanonicalFileName: fileName => fileName,
          getCurrentDirectory: () => repositoryRoot,
          getNewLine: () => '\n',
        },
      )}`,
    );
  }

  console.error(issueSignal);
  process.exitCode = 1;
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
