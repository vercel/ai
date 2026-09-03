import { createMCPClient, type McpProviderMetadata } from '@ai-sdk/mcp';
import { openai } from '@ai-sdk/openai';
import {
  generateText,
  stepCountIs,
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
    const mcpTools = await mcpClient.tools();
    const tools = Object.fromEntries(
      Object.entries(mcpTools).map(([name, mcpTool]) => {
        const annotations = (mcpTool.metadata as McpProviderMetadata | undefined)
          ?.annotations;

        // Only an explicit read-only hint bypasses approval. False or missing
        // hints require approval because server annotations are untrusted.
        return [
          name,
          {
            ...mcpTool,
            needsApproval: annotations?.readOnlyHint !== true,
          },
        ];
      }),
    );
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
        messages,
        stopWhen: stepCountIs(5),
        system:
          'When a tool execution is not approved by the user, do not retry it. ' +
          'Just say that the tool execution was not approved.',
      });

      for (const part of result.content) {
        switch (part.type) {
          case 'text': {
            process.stdout.write(`\nAssistant:\n${part.text}\n`);
            break;
          }

          case 'tool-approval-request': {
            const metadata = part.toolCall.toolMetadata as
              | McpProviderMetadata
              | undefined;
            const annotations = metadata?.annotations;

            console.log(
              '\nServer annotations:',
              annotations ?? '(none)',
            );
            console.log(
              `Requested ${part.toolCall.toolName}:`,
              part.toolCall.input,
            );

            const reason =
              annotations?.destructiveHint === true
                ? 'The MCP server marks this tool as destructive.'
                : 'The MCP server does not mark this tool as read-only.';
            const answer = await terminal.question(
              `${reason} Approve? (y/n)\n`,
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
        }
      }

      messages.push(...result.response.messages);
    }
  } finally {
    terminal.close();
    await mcpClient.close();
  }
}

main().catch(console.error);
