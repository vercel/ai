import { Output, stepCountIs, tool, ToolLoopAgent } from 'ai';
import { z } from 'zod';

const evidenceToken = 'EVIDENCE-10788';

async function runAgent(model: string) {
  let toolExecutionCount = 0;

  const agent = new ToolLoopAgent({
    model,
    instructions:
      'You refine case descriptions. You must call getCaseFacts before producing the final structured output. Base the output only on the returned facts and copy its evidenceToken exactly.',
    tools: {
      getCaseFacts: tool({
        description:
          'Returns the private facts required to refine the case description.',
        inputSchema: z.object({}),
        execute: async () => {
          toolExecutionCount += 1;
          return {
            evidenceToken,
            facts:
              'The customer could not sign in after enabling single sign-on.',
          };
        },
      }),
    },
    output: Output.object({
      schema: z.object({
        refinedDescription: z.string(),
        evidenceToken: z.string(),
      }),
    }),
    stopWhen: stepCountIs(6),
  });

  const result = await agent.generate({
    prompt:
      'Refine case 10788 using the private case facts. Do not guess or omit the evidence token.',
  });

  return {
    model,
    toolExecutionCount,
    stepCount: result.steps.length,
    toolCallsPerStep: result.steps.map(step => step.toolCalls.length),
    output: result.output,
  };
}

async function main() {
  const gpt41 = await runAgent('openai/gpt-4.1');
  const gpt51 = await runAgent('openai/gpt-5.1-instant');

  console.log(JSON.stringify({ gpt41, gpt51 }, null, 2));

  if (gpt41.toolExecutionCount === 0) {
    throw new Error(
      'Reproduced issue #10788: GPT-4.1 produced structured output without calling the configured tool.',
    );
  }

  if (gpt41.output.evidenceToken !== evidenceToken) {
    throw new Error(
      'GPT-4.1 did not produce structured output based on the tool result.',
    );
  }

  if (gpt51.toolExecutionCount === 0) {
    throw new Error(
      'GPT-5.1 Instant comparison did not call the configured tool.',
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
