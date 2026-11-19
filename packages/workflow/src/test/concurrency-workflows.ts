import { tool, type ModelMessage } from 'ai';
import { createHook } from 'workflow';
import { z } from 'zod/v4';
import { mockTextModel } from '../providers/mock.js';
import { WorkflowAgent } from '../workflow-agent.js';

async function completeAction(id: string) {
  'use step';
  return id;
}

export async function resumeSequentialApprovals(mode: 'generate' | 'stream') {
  'use workflow';
  const events: string[] = [];
  const agent = new WorkflowAgent({
    model: mockTextModel('Done.'),
    toolCallConcurrency: 1,
    tools: {
      action: tool({
        inputSchema: z.object({ id: z.string() }),
        needsApproval: true,
        execute: async ({ id }) => {
          events.push(`start:${id}`);
          if (id === 'first') {
            using hook = createHook<string>();
            await hook;
          }
          const result = await completeAction(id);
          events.push(`end:${id}`);
          return result;
        },
      }),
    },
  });
  const ids = ['first', 'second'];
  const messages: ModelMessage[] = [
    { role: 'user', content: 'Run the tools.' },
    {
      role: 'assistant',
      content: ids.flatMap(id => [
        {
          type: 'tool-call' as const,
          toolCallId: id,
          toolName: 'action',
          input: { id },
        },
        {
          type: 'tool-approval-request' as const,
          toolCallId: id,
          approvalId: `approval-${id}`,
        },
      ]),
    },
    {
      role: 'tool',
      content: [...ids].reverse().map(id => ({
        type: 'tool-approval-response' as const,
        approvalId: `approval-${id}`,
        approved: true,
      })),
    },
  ];
  if (mode === 'generate') await agent.generate({ messages });
  else await agent.stream({ messages });
  return events;
}
