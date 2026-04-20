import { openai } from '@ai-sdk/openai';
import {
  ModelMessage,
  isStepCount,
  streamText,
  tool,
  ToolApprovalResponse,
} from 'ai';
import * as readline from 'node:readline/promises';
import { z } from 'zod';
import { run } from '../../lib/run';

const terminal = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const weatherTool = tool({
  description: 'Get the weather in a location',
  inputSchema: z.object({
    location: z.string().describe('The location to get the weather for'),
  }),
  execute: async ({ location }) => ({
    location,
    temperature: 72 + Math.floor(Math.random() * 21) - 10,
  }),
});

run(async () => {
  const messages: ModelMessage[] = [];
  let approvals: ToolApprovalResponse[] = [];

  while (true) {
    messages.push(
      approvals.length > 0
        ? { role: 'tool', content: approvals }
        : { role: 'user', content: await terminal.question('You:\n') },
    );

    approvals = [];

    const result = streamText({
      model: openai('gpt-5-mini'),
      // context engineering required to make sure the model does not retry
      // the tool execution if it is not approved:
      system:
        'When a tool execution is not approved by the user, do not retry it.' +
        'Just say that the tool execution was not approved.',
      tools: { weather: weatherTool },
      toolApproval: {
        weather: ({ location }) => {
          if (location.toLowerCase().includes('san francisco')) {
            return 'approved';
          }

          if (location.toLowerCase().includes('new york')) {
            return 'denied';
          }

          return 'user-approval';
        },
      },
      messages,
      stopWhen: isStepCount(5),
    });

    process.stdout.write('\nAssistant: ');
    for await (const delta of result.textStream) {
      process.stdout.write(delta);
    }

    // go through each approval request and ask the user for approval
    for (const part of await result.content) {
      console.log(part.type);

      if (
        part.type === 'tool-approval-request' &&
        part.toolCall.toolName === 'weather' &&
        !part.toolCall.dynamic &&
        !part.isAutomatic
      ) {
        const answer = await terminal.question(
          `\nCan I retrieve the weather for ${part.toolCall.input.location} (y/n)?`,
        );

        approvals.push({
          type: 'tool-approval-response',
          approvalId: part.approvalId,
          approved:
            answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes',
        });
      }

      if (
        part.type === 'tool-approval-response' &&
        part.toolCall.toolName === 'weather' &&
        !part.toolCall.dynamic
      ) {
        process.stdout.write(
          `Weather tool execution for ${part.toolCall.input.location} was automatically ${part.approved ? 'approved' : 'denied'}.`,
        );
      }
    }

    process.stdout.write('\n\n');

    messages.push(...(await result.response).messages);
  }
});
