import { openai } from '@ai-sdk/openai';
import {
  ToolLoopAgent,
  tool,
  type ModelMessage,
  type ToolApprovalResponse,
} from 'ai';
import { z } from 'zod';
import { run } from '../../lib/run';

run(async () => {
  const toolApprovalSecret = process.env.TOOL_APPROVAL_SECRET ?? 'secret';

  const agent = new ToolLoopAgent({
    model: openai('gpt-5.4-mini'),
    instructions:
      'Use the weather tool when a user asks for the weather. After a tool result, summarize it briefly.',
    tools: {
      weather: tool({
        description: 'Get the weather in a location.',
        inputSchema: z.object({ location: z.string() }),
        execute: async ({ location }) => ({ location, temperature: 72 }),
      }),
    },
    toolApproval: { weather: 'user-approval' },
    // Keep this secret on the server. It signs each approval request and
    // prevents clients from forging or modifying approval responses.
    experimental_toolApprovalSecret: toolApprovalSecret,
  });

  const messages: ModelMessage[] = [
    { role: 'user', content: 'What is the weather in San Francisco?' },
  ];
  const pendingResult = await agent.generate({ messages });

  let approvalId: string | undefined;

  for (const step of pendingResult.steps) {
    for (const part of step.content) {
      if (part.type === 'tool-approval-request') {
        approvalId = part.approvalId;
        break;
      }
    }
  }

  if (approvalId == null) {
    throw new Error('Expected a tool approval request.');
  }

  // In an application, collect this decision from the user or your approval
  // system. The signed approval request is included in responseMessages.
  const approvals: ToolApprovalResponse[] = [
    {
      type: 'tool-approval-response',
      approvalId,
      approved: true,
    },
  ];

  messages.push(...pendingResult.responseMessages);
  messages.push({ role: 'tool', content: approvals });

  const finalResult = await agent.generate({ messages });

  console.log(finalResult.text);
});
