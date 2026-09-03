import { WorkflowAgent } from '../workflow-agent.js';
import { mockTextModel } from '../providers/mock.js';
import { getWritable } from 'workflow';

export async function reproduceIssue20274Workflow() {
  'use workflow';

  const abortController = new AbortController();
  const agent = new WorkflowAgent({
    model: mockTextModel('completed'),
  });

  const result = await agent.stream({
    messages: [{ role: 'user', content: 'continue' }],
    writable: getWritable(),
    abortSignal: abortController.signal,
  });

  return {
    stepCount: result.steps.length,
    lastStepText: result.steps.at(-1)?.text,
  };
}
