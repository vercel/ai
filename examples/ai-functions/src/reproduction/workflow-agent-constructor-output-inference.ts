import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Output, WorkflowAgent } from '@ai-sdk/workflow';
import { z } from 'zod';

async function assertConstructorOutputInference() {
  const agent = new WorkflowAgent({
    model: 'anthropic/claude-sonnet-4-6',
    output: Output.object({
      schema: z.object({ answer: z.string() }),
    }),
  });

  const result = await agent.stream({ prompt: 'answer' });
  const answer: string = result.output.answer;
  void answer;

  const callSiteResult = await agent.stream({
    prompt: 'answer',
    output: Output.object({
      schema: z.object({ answer: z.string() }),
    }),
  });
  const callSiteAnswer: string = callSiteResult.output.answer;
  void callSiteAnswer;
}

async function main() {
  void assertConstructorOutputInference;

  const result = spawnSync(
    'pnpm',
    [
      'exec',
      'tsc',
      '--noEmit',
      '--strict',
      '--skipLibCheck',
      '--target',
      'es2022',
      '--module',
      'esnext',
      '--moduleResolution',
      'bundler',
      '--types',
      'node',
      fileURLToPath(import.meta.url),
    ],
    {
      cwd: fileURLToPath(new URL('../..', import.meta.url)),
      encoding: 'utf8',
    },
  );

  const compilerOutput = `${result.stdout}${result.stderr}`;
  const expectedDiagnostic =
    "error TS2339: Property 'answer' does not exist on type 'never'.";

  if (compilerOutput.includes(expectedDiagnostic)) {
    console.error(
      'ISSUE_20073_REPRODUCED: constructor-level WorkflowAgent output is inferred as never',
    );
    process.exitCode = 1;
    return;
  }

  if (result.status !== 0) {
    console.error(compilerOutput);
    console.error(
      'ISSUE_20073_HARNESS_ERROR: TypeScript failed for an unrelated reason',
    );
    process.exitCode = 2;
    return;
  }

  console.log(
    'ISSUE_20073_NOT_REPRODUCED: constructor-level WorkflowAgent output is inferred',
  );
}

await main();
