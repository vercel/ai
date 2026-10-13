import { openai } from '@ai-sdk/openai';
import {
  ToolLoopAgent,
  tool,
  type ModelMessage,
  type ToolApprovalResponse,
} from 'ai';
import { z } from 'zod/v4';
import { run } from '../../lib/run';

run(async () => {
  const agent = new ToolLoopAgent({
    model: openai('gpt-5-mini'),
    instructions:
      'Use the weather tool when a user asks for the weather. After a tool result, summarize it briefly.',
    tools: {
      weather: tool({
        description: 'Get the weather in a location.',
        inputSchema: z.object({ location: z.string() }),
        execute: async ({ location }) => ({ location, temperature: 72 }),
        needsApproval: true,
      }),
    },
    // Use a unique secret in production and keep it on the server.
    experimental_toolApprovalSecret:
      process.env.TOOL_APPROVAL_SECRET ?? 'secret',
  });

  const messages: ModelMessage[] = [
    { role: 'user', content: 'What is the weather in San Francisco?' },
  ];
  const pendingResult = await agent.generate({ messages });

  let approvalId: string | undefined;

  for (const part of pendingResult.content) {
    if (part.type === 'tool-approval-request') {
      approvalId = part.approvalId;
      break;
    }
  }

  if (approvalId == null) {
    throw new Error('Expected a tool approval request.');
  }

  // In an application, collect this decision from the user or your approval
  // system. The signed approval request is included in response.messages.
  const approvals: ToolApprovalResponse[] = [
    {
      type: 'tool-approval-response',
      approvalId,
      approved: true,
    },
  ];

  messages.push(...pendingResult.response.messages);
  messages.push({ role: 'tool', content: approvals });

  const finalResult = await agent.generate({ messages });

  console.log(finalResult.text);
});
