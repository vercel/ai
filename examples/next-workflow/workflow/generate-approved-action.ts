import { WorkflowAgent } from '@ai-sdk/workflow';
import { tool, type ModelMessage } from 'ai';
import { z } from 'zod/v4';

async function recordDecision({ description }: { description: string }) {
  'use step';
  // Replace with the application's durable action after testing the approval UI.
  return { recorded: description };
}

/** Supply the original history plus the saved responseMessages and user decision. */
export async function generateApprovedAction(
  modelId: string,
  messages: ModelMessage[],
): Promise<{ text: string; responseMessages: ModelMessage[] }> {
  'use workflow';

  const agent = new WorkflowAgent({
    model: modelId,
    experimental_toolApprovalSecret: {
      environmentVariable: 'WORKFLOW_TOOL_APPROVAL_SECRET',
    },
    tools: {
      recordDecision: tool({
        description: 'Record a decision after the user approves it.',
        inputSchema: z.object({ description: z.string() }),
        needsApproval: true,
        execute: recordDecision,
      }),
    },
  });
  const result = await agent.generate({ messages });
  return { text: result.text, responseMessages: result.responseMessages };
}
