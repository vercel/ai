/**
 * Integration test workflows for the WorkflowAgent default step limit.
 */
import { tool } from 'ai';
import { z } from 'zod/v4';
import { mockSequenceModel } from '../providers/mock.js';
import { WorkflowAgent } from '../workflow-agent.js';

async function echoStep(): Promise<string> {
  'use step';
  return 'ok';
}

export async function agentDefaultStepLimitE2e(): Promise<number> {
  'use workflow';
  const agent = new WorkflowAgent({
    model: mockSequenceModel([
      { type: 'tool-call', toolName: 'echo', input: '{}' },
    ]),
    tools: {
      echo: tool({
        inputSchema: z.object({}),
        execute: echoStep,
      }),
    },
    instructions: 'Keep calling the echo tool.',
  });

  const result = await agent.generate({
    messages: [{ role: 'user', content: 'Keep calling the echo tool.' }],
  });

  return result.steps.length;
}
