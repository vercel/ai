import { openai } from '@ai-sdk/openai';
import {
  ModelMessage,
  stepCountIs,
  streamText,
  dynamicTool,
  ToolApprovalResponse,
  ToolSet,
} from 'ai';
import 'dotenv/config';
import * as readline from 'node:readline/promises';
import { z } from 'zod';
import { run } from '../lib/run';

const terminal = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const weatherTool = dynamicTool({
  description: 'Get the weather in a location',
  inputSchema: z.object({
    location: z.string().describe('The location to get the weather for'),
  }),
  execute: async input => ({
    location: (input as { location: string }).location,
    temperature: 72 + Math.floor(Math.random() * 21) - 10,
  }),
  needsApproval: true,
});

// type as generic ToolSet (tools are not known at development time)
const tools: ToolSet = { weather: weatherTool };

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
      tools,
      messages,
      stopWhen: stepCountIs(5),
    });

    process.stdout.write('\nAssistant: ');
    for await (const delta of result.textStream) {
      process.stdout.write(delta);
    }

    // go through each approval request and ask the user for approval
    const content = await result.content;
    for (const part of content) {
      if (part.type === 'tool-approval-request') {
        const answer = await terminal.question(
          `\nCan I retrieve execute the tool "${part.toolCall.toolName}" ` +
            `with input ${JSON.stringify(part.toolCall.input)} (y/n)?`,
        );

        approvals.push({
          type: 'tool-approval-response',
          approvalId: part.approvalId,
          approved:
            answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes',
        });
      }
    }

    process.stdout.write('\n\n');

    messages.push(...(await result.response).messages);
  }
});
