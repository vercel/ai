import { Output, stepCountIs, tool, ToolLoopAgent } from 'ai';
import { z } from 'zod';

const toolResult = {
  customer: 'Ada Lovelace',
  incident: 'Invoices are duplicated after retrying a timed-out payment.',
  incidentId: 'CASE-10788',
};

async function runAgent(model: string) {
  let toolExecutionCount = 0;

  const agent = new ToolLoopAgent({
    model,
    instructions: [
      'You refine support case descriptions.',
      'You must call lookupCase before producing the final structured output.',
      'The lookup result is the only source of the customer name and incident details.',
      'Do not invent lookup results.',
    ].join(' '),
    tools: {
      lookupCase: tool({
        description:
          'Look up the authoritative customer and incident details for a case.',
        inputSchema: z.object({
          incidentId: z.string(),
        }),
        execute: async () => {
          toolExecutionCount++;
          return toolResult;
        },
      }),
    },
    output: Output.object({
      schema: z.object({
        refinedDescription: z.string(),
      }),
    }),
    stopWhen: stepCountIs(6),
    temperature: 0,
  });

  const result = await agent.generate({
    prompt:
      'Refine incident CASE-10788. Use lookupCase first, then include the customer name and exact incident details in refinedDescription.',
  });

  return {
    model,
    output: result.output,
    stepCount: result.steps.length,
    toolCallCount: result.toolCalls.length,
    toolExecutionCount,
  };
}

async function main() {
  const gpt41 = await runAgent('openai/gpt-4.1');
  const gpt51 = await runAgent('openai/gpt-5.1-instant');

  console.log(JSON.stringify({ gpt41, gpt51 }, null, 2));

  if (gpt41.toolExecutionCount === 0) {
    throw new Error(
      'ISSUE_10788_REPRODUCED: GPT-4.1 made zero tool calls when Output.object was specified.',
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
