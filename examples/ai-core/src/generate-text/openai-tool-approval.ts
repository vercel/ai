import { openai } from '@ai-sdk/openai';
import {
  generateText,
  ModelMessage,
  stepCountIs,
  tool,
  ToolApprovalResponse,
} from 'ai';
import * as readline from 'node:readline/promises';
import { z } from 'zod/v4';
import { run } from '../lib/run';

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
  needsApproval: true,
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

    const result = await generateText({
      model: openai('gpt-5-mini'),
      tools: { weather: weatherTool },
      messages,
      stopWhen: stepCountIs(5),
      onStepFinish: ({ request }) => {
        console.log(JSON.stringify(request.body, null, 2));
      },
    });

    process.stdout.write(`\nAssistant:\n`);
    for (const part of result.content) {
      if (part.type === 'text') {
        process.stdout.write(part.text);
      }

      if (part.type === 'tool-approval-request') {
        if (part.toolCall.toolName === 'weather' && !part.toolCall.dynamic) {
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
      }
    }

    process.stdout.write('\n\n');

    messages.push(...result.response.messages);
  }
});
