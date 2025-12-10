import { createOpenAI } from '@ai-sdk/openai';
import {
  generateText,
  ModelMessage,
  stepCountIs,
  ToolApprovalResponse,
} from 'ai';
import * as readline from 'node:readline/promises';
import { run } from '../lib/run';

const terminal = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const openai = createOpenAI();

run(async () => {
  const messages: ModelMessage[] = [];
  let approvals: ToolApprovalResponse[] = [];

  while (true) {
    messages.push(
      approvals.length > 0
        ? { role: 'tool', content: approvals }
        : { role: 'user', content: await terminal.question('You:\n') },
    );

    if (approvals.length === 0) {
      const lastMessage = messages[messages.length - 1];
      if (
        lastMessage.role === 'user' &&
        typeof lastMessage.content === 'string' &&
        lastMessage.content.toLowerCase() === 'exit'
      ) {
        terminal.close();
        break;
      }
    }

    approvals = [];

    const result = await generateText({
      model: openai.responses('gpt-5-mini'),
      system:
        'You are a helpful assistant that can search the web for information. ' +
        'Use the MCP tools available to you to find up-to-date information when needed. ' +
        'When a tool execution is not approved by the user, do not retry it. ' +
        'Just say that the tool execution was not approved.',
      tools: {
        mcp: openai.tools.mcp({
          serverLabel: 'exa',
          serverUrl: 'https://mcp.exa.ai/mcp',
          serverDescription: 'A web-search API for AI agents',
          requireApproval: 'always',
        }),
      },
      messages,
      stopWhen: stepCountIs(10),
    });

    for (const part of result.content) {
      if (part.type === 'tool-approval-request') {
        const answer = await terminal.question(`\nApprove MCP tool call? (y/n): `);
        approvals.push({
          type: 'tool-approval-response',
          approvalId: part.approvalId,
          approved:
            answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes',
        });
      } else if (part.type === 'text') {
        console.log(`\nAssistant:\n${part.text}`);
      }
    }

    messages.push(...result.response.messages);
  }
});
