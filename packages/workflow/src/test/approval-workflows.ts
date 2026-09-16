import { tool, type ModelMessage } from 'ai';
import { createHook } from 'workflow';
import { z } from 'zod/v4';
import { mockSequenceModel } from '../providers/mock.js';
import { WorkflowAgent } from '../workflow-agent.js';

const secret = { environmentVariable: 'WORKFLOW_TOOL_APPROVAL_SECRET' };

async function performApprovedAction({ value }: { value: string }) {
  'use step';
  return `performed:${value}`;
}

function approvalTools() {
  return {
    action: tool({
      inputSchema: z.object({ value: z.string() }),
      needsApproval: true,
      execute: performApprovedAction,
    }),
  };
}

export async function issueGenerateApproval(): Promise<ModelMessage[]> {
  'use workflow';
  const agent = new WorkflowAgent({
    model: mockSequenceModel([
      {
        type: 'tool-call',
        toolName: 'action',
        input: '{"value":"approved-action"}',
      },
    ]),
    tools: approvalTools(),
    experimental_toolApprovalSecret: secret,
  });
  const result = await agent.generate({ prompt: 'Perform the action.' });
  return result.responseMessages;
}

export async function resumeGenerateApproval(
  messages: ModelMessage[],
  approved: boolean,
) {
  'use workflow';
  const agent = new WorkflowAgent({
    model: mockSequenceModel([{ type: 'text', text: 'Finished.' }]),
    tools: approvalTools(),
    experimental_toolApprovalSecret: secret,
  });
  const result = await agent.generate({
    messages: [
      { role: 'user', content: 'Perform the action.' },
      ...messages,
      {
        role: 'tool',
        content: [
          {
            type: 'tool-approval-response',
            approvalId: 'approval-call-1',
            approved,
          },
        ],
      },
    ],
  });
  return { text: result.text, responseMessages: result.responseMessages } as {
    text: string;
    responseMessages: ModelMessage[];
  };
}

async function completedWork() {
  'use step';
  return 'completed before suspension';
}

export async function generateWithSuspendingTool() {
  'use workflow';
  const agent = new WorkflowAgent({
    model: mockSequenceModel([
      { type: 'tool-call', toolName: 'completedWork', input: '{}' },
      { type: 'tool-call', toolName: 'waitForInput', input: '{}' },
      { type: 'text', text: 'Resumed.' },
    ]),
    tools: {
      completedWork: tool({
        inputSchema: z.object({}),
        execute: completedWork,
      }),
      waitForInput: tool({
        inputSchema: z.object({}),
        execute: async () => {
          using hook = createHook<string>();
          return await hook;
        },
      }),
    },
  });
  const result = await agent.generate({ prompt: 'Do work, then wait.' });
  return {
    text: result.text,
    outputs: result.toolResults.map(result => result.output),
  };
}
