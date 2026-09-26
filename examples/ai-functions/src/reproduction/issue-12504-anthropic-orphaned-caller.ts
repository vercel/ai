import 'dotenv/config';
import { anthropic } from '@ai-sdk/anthropic';
import {
  convertToModelMessages,
  generateText,
  jsonSchema,
  pruneMessages,
  tool,
  type ModelMessage,
  type UIMessage,
} from 'ai';

const sourceToolCallId = 'srvtoolu_01MzSrFWsmzBdcoQkGWLyRjK';
const dependentToolCallId = 'toolu_019jKkXz4jAdwHweHBw92CVY';

const tools = {
  code_execution: anthropic.tools.codeExecution_20250825(),
  lookup: tool({
    description: 'Look up a stock ticker price.',
    inputSchema: jsonSchema<{ ticker: string }>({
      type: 'object',
      properties: {
        ticker: { type: 'string' },
      },
      required: ['ticker'],
      additionalProperties: false,
    }),
    execute: async ({ ticker }) => ({ ticker, price: 185.42 }),
    providerOptions: {
      anthropic: {
        allowedCallers: ['code_execution_20250825'],
      },
    },
  }),
};

function containsToolCall(
  messages: ModelMessage[],
  toolCallId: string,
): boolean {
  return messages.some(
    message =>
      typeof message.content !== 'string' &&
      message.content.some(
        part => part.type === 'tool-call' && part.toolCallId === toolCallId,
      ),
  );
}

async function main() {
  const uiMessages: UIMessage[] = [
    {
      id: 'user-1',
      role: 'user',
      parts: [
        {
          type: 'text',
          text: 'Use code execution to look up AAPL and calculate 100 shares.',
        },
      ],
    },
    {
      id: 'assistant-1',
      role: 'assistant',
      parts: [
        { type: 'step-start' },
        {
          type: 'tool-code_execution',
          toolCallId: sourceToolCallId,
          state: 'output-available',
          input: {
            type: 'programmatic-tool-call',
            code: "price = await lookup({'ticker': 'AAPL'})",
          },
          output: {
            type: 'code_execution_result',
            stdout: '',
            stderr: '',
            return_code: 0,
            content: [],
          },
          providerExecuted: true,
        },
        { type: 'step-start' },
        {
          type: 'tool-lookup',
          toolCallId: dependentToolCallId,
          state: 'output-available',
          input: { ticker: 'AAPL' },
          output: { ticker: 'AAPL', price: 185.42 },
          callProviderMetadata: {
            anthropic: {
              caller: {
                type: 'code_execution_20250825',
                toolId: sourceToolCallId,
              },
            },
          },
        },
        { type: 'step-start' },
        { type: 'text', text: 'The price is $185.42.', state: 'done' },
        { type: 'step-start' },
        { type: 'text', text: '100 shares cost $18,542.', state: 'done' },
        { type: 'step-start' },
        { type: 'text', text: 'Calculation complete.', state: 'done' },
      ],
    },
    {
      id: 'user-2',
      role: 'user',
      parts: [{ type: 'text', text: 'Now do the same for MSFT.' }],
    },
  ];

  const modelMessages = await convertToModelMessages(uiMessages, {
    tools,
    ignoreIncompleteToolCalls: true,
  });

  const prunedMessages = pruneMessages({
    messages: modelMessages,
    toolCalls: 'before-last-5-messages',
    emptyMessages: 'remove',
  });

  const sourceWasPresent = containsToolCall(modelMessages, sourceToolCallId);
  const sourceWasPruned = !containsToolCall(prunedMessages, sourceToolCallId);
  const dependentWasKept = containsToolCall(
    prunedMessages,
    dependentToolCallId,
  );

  if (!sourceWasPresent || !sourceWasPruned || !dependentWasKept) {
    if (sourceWasPresent && !sourceWasPruned && dependentWasKept) {
      await generateText({
        model: anthropic('claude-opus-4-5-20251101'),
        tools,
        messages: prunedMessages,
        maxOutputTokens: 32,
      });
      console.log(
        'Issue #12504 is fixed: pruning retained the source code-execution tool call.',
      );
      return;
    }

    throw new Error(
      'Reproduction setup did not create the reported dependent tool-call chain.',
    );
  }

  try {
    await generateText({
      model: anthropic('claude-opus-4-5-20251101'),
      tools,
      messages: prunedMessages,
      maxOutputTokens: 32,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (
      message.includes('source tool') &&
      message.includes('not found for tool use block')
    ) {
      throw new Error(
        'ISSUE_12504_REPRODUCED: Anthropic rejected the orphaned caller source tool reference.',
      );
    }

    throw error;
  }

  throw new Error(
    'Anthropic accepted a payload with an orphaned caller source tool reference.',
  );
}

main();
