import { openai } from '@ai-sdk/openai';
import { ModelMessage, ToolApprovalResponse, ToolLoopAgent } from 'ai';
import * as readline from 'node:readline/promises';
import { run } from '../../lib/run';
import { weatherTool } from '../../tools/weather-tool';

const agent = new ToolLoopAgent({
  model: openai('gpt-5-mini'),
  // context engineering required to make sure the model does not retry
  // the tool execution if it is not approved:
  instructions:
    'When a tool execution is not approved by the user, do not retry it.' +
    'Just say that the tool execution was not approved.',
  tools: { weather: weatherTool },
  toolApproval: { weather: 'user-approval' },
});

const terminal = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
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

    const result = await agent.generate({ messages });

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
