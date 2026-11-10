import { getWritable } from 'workflow';
import { z } from 'zod/v4';
import { mockSequenceModel } from '../providers/mock.js';
import { WorkflowAgent } from '../workflow-agent.js';

async function addNumbers(input: { a: number; b: number }) {
  'use step';
  return input.a + input.b;
}

export async function issue24584Workflow(
  mode: 'generate' | 'stream',
  ending: 'client-tool' | 'text',
) {
  'use workflow';
  const agent = new WorkflowAgent({
    model: mockSequenceModel([
      {
        type: 'tool-call',
        toolName: 'addNumbers',
        input: '{"a":2,"b":3}',
      },
      ending === 'client-tool'
        ? {
            type: 'tool-call',
            toolName: 'askUser',
            input: '{"question":"Continue?"}',
          }
        : { type: 'text', text: 'The sum is 5' },
    ]),
    tools: {
      addNumbers: {
        inputSchema: z.object({ a: z.number(), b: z.number() }),
        execute: addNumbers,
      },
      askUser: {
        inputSchema: z.object({ question: z.string() }),
      },
    },
    telemetry: { functionId: 'issue-24584' },
  });
  const result =
    mode === 'generate'
      ? await agent.generate({
          prompt: 'Add 2 and 3, then ask whether to continue.',
        })
      : await agent.stream({
          prompt: 'Add 2 and 3, then ask whether to continue.',
          writable: getWritable(),
        });
  return {
    steps: result.steps.length,
    lastTool: result.steps.at(-1)?.toolCalls.at(-1)?.toolName,
    executedTools: result.steps.flatMap(step =>
      step.toolResults.map(part => part.toolName),
    ),
  };
}
