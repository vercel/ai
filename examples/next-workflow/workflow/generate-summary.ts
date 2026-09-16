import { WorkflowAgent } from '@ai-sdk/workflow';

/** Start with start(generateSummary, [modelId, text]) and await run.returnValue. */
export async function generateSummary(modelId: string, text: string) {
  'use workflow';

  const agent = new WorkflowAgent({
    model: modelId,
    instructions: 'Summarize the supplied text in three concise sentences.',
  });
  const result = await agent.generate({ prompt: text });

  // Result getters and generated-file instances are for use in this workflow.
  // Return the fields the caller needs as serializable data.
  return { summary: result.text, usage: result.usage };
}
