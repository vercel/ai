import { anthropic } from '@ai-sdk/anthropic';
import {
  convertToModelMessages,
  jsonSchema,
  pruneMessages,
  streamText,
  tool,
  type ModelMessage,
  type UIMessage,
} from 'ai';

const sourceToolCallId = 'srvtoolu_01Issue12504Source';
const dependentToolCallId = 'toolu_01Issue12504Lookup';

const tools = {
  code_execution: anthropic.tools.codeExecution_20250825(),
  lookup: tool({
    description: 'Look up a stock ticker price.',
    inputSchema: jsonSchema<{ ticker: string }>({
      type: 'object',
      properties: { ticker: { type: 'string' } },
      required: ['ticker'],
      additionalProperties: false,
    }),
    execute: async ({ ticker }: { ticker: string }) => ({
      ticker,
      price: 185.42,
    }),
    providerOptions: {
      anthropic: {
        allowedCallers: ['code_execution_20250825'],
      },
    },
  }),
};

function hasToolCall(messages: ModelMessage[], toolCallId: string) {
  return messages.some(
    message =>
      (message.role === 'assistant' || message.role === 'tool') &&
      typeof message.content !== 'string' &&
      message.content.some(
        part =>
          (part.type === 'tool-call' || part.type === 'tool-result') &&
          part.toolCallId === toolCallId,
      ),
  );
}

function getErrorText(error: unknown) {
  const candidate = error as {
    message?: string;
    responseBody?: string;
    data?: { error?: { message?: string } };
  };

  return [
    candidate.message,
    candidate.responseBody,
    candidate.data?.error?.message,
  ]
    .filter((value): value is string => value != null)
    .join('\n');
}

async function request(messages: ModelMessage[]) {
  let streamError: unknown;
  const result = streamText({
    model: anthropic('claude-opus-4-5-20251101'),
    tools,
    messages,
    maxOutputTokens: 32,
    onError: ({ error }) => {
      streamError = error;
    },
  });

  await result.consumeStream();

  if (streamError != null) {
    throw streamError;
  }
}

async function main() {
  const uiMessages = [
    {
      id: 'initial-user',
      role: 'user',
      parts: [
        {
          type: 'text',
          text: 'Use code execution to look up AAPL.',
        },
      ],
    },
    {
      id: 'first-assistant-turn',
      role: 'assistant',
      parts: [
        { type: 'step-start' },
        {
          type: 'tool-code_execution',
          state: 'output-available',
          toolCallId: sourceToolCallId,
          input: {
            type: 'programmatic-tool-call',
            code: 'lookup({"ticker":"AAPL"})',
          },
          output: {
            type: 'code_execution_result',
            stdout: '{"ticker":"AAPL","price":185.42}',
            stderr: '',
            return_code: 0,
            content: [],
          },
          providerExecuted: true,
        },
        { type: 'step-start' },
        {
          type: 'tool-lookup',
          state: 'output-available',
          toolCallId: dependentToolCallId,
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
        { type: 'text', text: 'The lookup completed.', state: 'done' },
        { type: 'step-start' },
        { type: 'text', text: 'AAPL costs $185.42.', state: 'done' },
        { type: 'step-start' },
        {
          type: 'text',
          text: 'One hundred shares cost $18,542.',
          state: 'done',
        },
      ],
    },
    {
      id: 'follow-up-user',
      role: 'user',
      parts: [{ type: 'text', text: 'Now do the same for MSFT.' }],
    },
  ] satisfies UIMessage[];

  const convertedMessages = await convertToModelMessages(uiMessages);
  const prunedMessages = pruneMessages({
    messages: convertedMessages,
    toolCalls: 'before-last-5-messages',
    emptyMessages: 'remove',
  });

  console.log(
    JSON.stringify({
      convertedMessageCount: convertedMessages.length,
      prunedMessageCount: prunedMessages.length,
      sourcePresentBeforePruning: hasToolCall(
        convertedMessages,
        sourceToolCallId,
      ),
      sourcePresentAfterPruning: hasToolCall(prunedMessages, sourceToolCallId),
      dependentPresentAfterPruning: hasToolCall(
        prunedMessages,
        dependentToolCallId,
      ),
    }),
  );

  // The complete history is the control: Anthropic should accept the caller
  // reference when its source code-execution block is present.
  await request(convertedMessages);

  try {
    // This should also be accepted. A correct pruner must preserve the source
    // block required by the retained caller reference.
    await request(prunedMessages);
  } catch (error) {
    const errorText = getErrorText(error);

    if (
      errorText.includes(`source tool \`${sourceToolCallId}\` not found`) &&
      errorText.includes(`tool use block \`${dependentToolCallId}\``)
    ) {
      console.error(
        'ISSUE_12504_REPRODUCED: Anthropic rejected the pruned history because the retained caller references a missing source tool.',
      );
      console.error(errorText);
      process.exitCode = 1;
      return;
    }

    throw error;
  }

  console.log(
    'PASS: Anthropic accepted the pruned history with its caller dependency intact.',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 2;
});
