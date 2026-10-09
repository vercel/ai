import { anthropic } from '@ai-sdk/anthropic';
import assert from 'node:assert/strict';
import {
  convertToModelMessages,
  generateText,
  MissingToolResultsError,
  type ModelMessage,
  tool,
} from 'ai';
import { z } from 'zod';

const model = anthropic('claude-haiku-4-5');

const tools = {
  json: tool({
    inputSchema: z.object({ message: z.string() }),
  }),
  screenshot: tool({
    inputSchema: z.object({ value: z.string() }),
  }),
};

async function verifyReportedCompleteHistoryWorks() {
  const messages: ModelMessage[] = [
    {
      role: 'user',
      content: [{ type: 'text', text: 'generate 10 items' }],
    },
    {
      role: 'assistant',
      content: [
        {
          type: 'tool-call',
          toolCallId: 'tool-example-123',
          toolName: 'json',
          input: { message: 'generate 10 items' },
        },
        {
          type: 'text',
          text: 'I generated code for 10 items.',
        },
      ],
    },
    {
      role: 'tool',
      content: [
        {
          type: 'tool-result',
          toolCallId: 'tool-example-123',
          toolName: 'json',
          output: {
            type: 'json',
            value: {
              code: 'export const code = () => [...]',
              packageJson: '{}',
            },
          },
        },
      ],
    },
    {
      role: 'user',
      content: [{ type: 'text', text: 'Reply with OK.' }],
    },
  ];

  await generateText({
    model,
    messages,
    tools,
    maxOutputTokens: 16,
  });
}

async function verifyParallelToolHistoryWithoutTrailingUserWorks() {
  const messages: ModelMessage[] = [
    {
      role: 'user',
      content: [{ type: 'text', text: 'Take two screenshots.' }],
    },
    {
      role: 'assistant',
      content: [
        {
          type: 'tool-call',
          toolCallId: 'parallel-1',
          toolName: 'screenshot',
          input: { value: 'first' },
        },
        {
          type: 'tool-call',
          toolCallId: 'parallel-2',
          toolName: 'screenshot',
          input: { value: 'second' },
        },
      ],
    },
    {
      role: 'tool',
      content: [
        {
          type: 'tool-result',
          toolCallId: 'parallel-1',
          toolName: 'screenshot',
          output: { type: 'text', value: 'first screenshot' },
        },
        {
          type: 'tool-result',
          toolCallId: 'parallel-2',
          toolName: 'screenshot',
          output: { type: 'text', value: 'second screenshot' },
        },
      ],
    },
  ];

  await generateText({
    model,
    messages,
    tools,
    maxOutputTokens: 16,
  });
}

const incompleteUiMessages = [
  {
    role: 'user',
    parts: [{ type: 'text', text: 'Take the requested screenshots.' }],
  },
  {
    role: 'assistant',
    parts: [
      { type: 'step-start' },
      {
        type: 'tool-screenshot',
        state: 'output-available',
        toolCallId: 'call-complete',
        input: { value: 'first' },
        output: 'first screenshot',
      },
      { type: 'step-start' },
      {
        type: 'tool-screenshot',
        state: 'input-available',
        toolCallId: 'call-incomplete',
        input: { value: 'second' },
      },
      { type: 'text', text: 'Continuing.', state: 'done' },
    ],
  },
  {
    role: 'user',
    parts: [{ type: 'text', text: 'Summarize the completed work.' }],
  },
] as const;

async function verifyIncompleteToolCallConfiguration() {
  const unfilteredMessages = await convertToModelMessages(
    incompleteUiMessages as any,
  );

  await assert.rejects(
    generateText({
      model,
      messages: unfilteredMessages,
      tools,
      maxOutputTokens: 16,
    }),
    error =>
      MissingToolResultsError.isInstance(error) &&
      error.toolCallIds.includes('call-incomplete'),
    'the default conversion should retain and locally reject an incomplete tool call',
  );

  const filteredMessages = await convertToModelMessages(
    incompleteUiMessages as any,
    { ignoreIncompleteToolCalls: true },
  );

  await generateText({
    model,
    messages: filteredMessages,
    tools,
    maxOutputTokens: 16,
  });
}

async function main() {
  await verifyReportedCompleteHistoryWorks();
  await verifyParallelToolHistoryWithoutTrailingUserWorks();
  await verifyIncompleteToolCallConfiguration();
  console.log(
    'Issue #8516 was not reproduced with complete or documented filtered histories.',
  );
}

main();
