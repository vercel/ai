import { rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const typeTestSource = `
import { tool, type InferUITools, type UIMessage } from 'ai';
import {
  WorkflowAgent,
  type InferWorkflowAgentUIMessage,
} from '@ai-sdk/workflow';
import { z } from 'zod/v4';

const tools = {
  weather: tool({
    inputSchema: z.object({
      city: z.string(),
    }),
    execute: async ({ city }) => ({
      city,
      temperature: 72,
    }),
  }),
};

const agent = new WorkflowAgent({
  model: 'anthropic/claude-sonnet-4-6',
  tools,
});

type Message = InferWorkflowAgentUIMessage<typeof agent>;
type ExpectedMessage = UIMessage<
  unknown,
  never,
  InferUITools<typeof tools>
>;

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends
  (<Value>() => Value extends Right ? 1 : 2)
    ? (<Value>() => Value extends Right ? 1 : 2) extends
        (<Value>() => Value extends Left ? 1 : 2)
      ? true
      : false
    : false;

type Assert<Condition extends true> = Condition;
type WorkflowAgentMessageIncludesConfiguredTools = Assert<
  Equal<Message, ExpectedMessage>
>;
`;

async function main() {
  const typeTestPath = fileURLToPath(
    new URL('./.issue-20039-type-test.ts', import.meta.url),
  );

  await writeFile(typeTestPath, typeTestSource);

  try {
    const program = ts.createProgram([typeTestPath], {
      allowSyntheticDefaultImports: true,
      esModuleInterop: true,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      noEmit: true,
      skipLibCheck: true,
      strict: true,
      target: ts.ScriptTarget.ES2022,
    });
    const diagnostics = ts.getPreEmitDiagnostics(program);

    if (diagnostics.length === 0) {
      console.log(
        'InferWorkflowAgentUIMessage inferred the configured tool-weather input and output types.',
      );
      return;
    }

    const expectedDiagnostic = diagnostics.find(
      diagnostic =>
        diagnostic.code === 2344 &&
        ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n') ===
          "Type 'false' does not satisfy the constraint 'true'.",
    );

    if (expectedDiagnostic == null) {
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

    throw new Error(
      'Reproduced issue #20039: InferWorkflowAgentUIMessage does not infer the configured tool-weather input and output types.',
    );
  } finally {
    await rm(typeTestPath, { force: true });
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
