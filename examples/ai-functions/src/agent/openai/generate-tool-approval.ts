import { openai } from '@ai-sdk/openai';
import { ModelMessage, ToolApprovalResponse, ToolLoopAgent } from 'ai';
import * as readline from 'node:readline/promises';
import { run } from '../../lib/run';
import { weatherTool } from '../../tools/weather-tool';

const agent = new ToolLoopAgent({
  model: openai('gpt-5.4-mini'),
  // context engineering required to make sure the model does not retry
  // the tool execution if it is not approved for a particular tool call:
  instructions:
    'When a tool call was not approved by the user, ' +
    'do not retry the same tool call with the same input.' +
    'Say that the tool execution was not approved.',
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

    for (const step of result.steps) {
      for (const part of step.content) {
        switch (part.type) {
          case 'text': {
            process.stdout.write(`\nAssistant:\n`);
            process.stdout.write(part.text);
            break;
          }

          case 'tool-approval-request': {
            if (
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
                  answer.toLowerCase() === 'y' ||
                  answer.toLowerCase() === 'yes',
              });
            }
            break;
          }

          case 'tool-approval-response': {
            if (
              part.toolCall.toolName === 'weather' &&
              !part.toolCall.dynamic
            ) {
              process.stdout.write(
                `\nWeather tool execution for ${part.toolCall.input.location} was automatically ${
                  part.approved
                    ? '\x1b[32mapproved\x1b[0m'
                    : '\x1b[31mdenied\x1b[0m'
                }.\n`,
              );
            }
            break;
          }
        }
      }
    }

    process.stdout.write('\n\n');

    messages.push(...result.response.messages);
  }
});
