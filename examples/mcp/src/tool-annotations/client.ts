import { createMCPClient, type McpProviderMetadata } from '@ai-sdk/mcp';
import { openai } from '@ai-sdk/openai';
import {
  generateText,
  isStepCount,
  type ModelMessage,
  type ToolApprovalResponse,
} from 'ai';
import 'dotenv/config';
import * as readline from 'node:readline/promises';

const terminal = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

async function main() {
  const mcpClient = await createMCPClient({
    transport: {
      type: 'http',
      url: 'http://localhost:8086/mcp',
    },
  });

  try {
    const tools = await mcpClient.tools();
    const messages: ModelMessage[] = [];
    let approvals: ToolApprovalResponse[] = [];

    console.log('Try one of these prompts:');
    console.log('- Read note note-1');
    console.log('- Delete note note-1');
    console.log('- Create note note-2 with the text "Hello from MCP"');

    while (true) {
      messages.push(
        approvals.length > 0
          ? { role: 'tool', content: approvals }
          : { role: 'user', content: await terminal.question('\nYou:\n') },
      );
      approvals = [];

      const result = await generateText({
        model: openai('gpt-4o-mini'),
        tools,
        toolApproval: ({ toolCall }) => {
          const annotations = (
            toolCall.toolMetadata as McpProviderMetadata | undefined
          )?.annotations;

          // Only an explicit read-only hint bypasses approval. False or missing
          // hints require approval because server annotations are untrusted.
          return annotations?.readOnlyHint === true
            ? 'not-applicable'
            : {
                type: 'user-approval',
                reason:
                  annotations?.destructiveHint === true
                    ? 'The MCP server marks this tool as destructive.'
                    : 'The MCP server does not mark this tool as read-only.',
              };
        },
        messages,
        stopWhen: isStepCount(5),
      });

      for (const step of result.steps) {
        for (const part of step.content) {
          switch (part.type) {
            case 'text': {
              process.stdout.write(`\nAssistant:\n${part.text}\n`);
              break;
            }

            case 'tool-approval-request': {
              if (part.isAutomatic) {
                break;
              }

              const metadata = part.toolCall.toolMetadata as
                | McpProviderMetadata
                | undefined;
              console.log(
                '\nServer annotations:',
                metadata?.annotations ?? '(none)',
              );
              console.log(
                `Requested ${part.toolCall.toolName}:`,
                part.toolCall.input,
              );

              const answer = await terminal.question(
                `${part.reason ?? 'This tool requires approval.'} Approve? (y/n)\n`,
              );
              approvals.push({
                type: 'tool-approval-response',
                approvalId: part.approvalId,
                approved:
                  answer.toLowerCase() === 'y' ||
                  answer.toLowerCase() === 'yes',
              });
              break;
            }

            case 'tool-approval-response': {
              process.stdout.write(
                `\n${part.toolCall.toolName} was ${
                  part.approved
                    ? '\x1b[32mapproved\x1b[0m'
                    : '\x1b[31mdenied\x1b[0m'
                }.\n`,
              );
              if (part.reason != null) {
                process.stdout.write(`Reason: ${part.reason}\n`);
              }
              break;
            }
          }
        }
      }

      messages.push(...result.responseMessages);
    }
  } finally {
    terminal.close();
    await mcpClient.close();
  }
}

main().catch(console.error);
