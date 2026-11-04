import {
  generateText,
  jsonSchema,
  readUIMessageStream,
  streamText,
  tool,
  type FinishReason,
  type UIMessage,
} from 'ai';
import { MockLanguageModelV4, simulateReadableStream } from 'ai/test';

const usage = {
  inputTokens: {
    total: 1,
    noCache: 1,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};

const skippedFinishReasons = [
  'length',
  'error',
  'content-filter',
  'other',
] as const satisfies readonly FinishReason[];

const toolInputSchema = jsonSchema<{ text: string }>({
  type: 'object',
  properties: { text: { type: 'string' } },
  required: ['text'],
});

type Failure = {
  scenario: string;
  expected: string;
  observed: unknown;
};

function record(
  failures: Failure[],
  scenario: string,
  condition: boolean,
  expected: string,
  observed: unknown,
) {
  if (!condition) {
    failures.push({ scenario, expected, observed });
  }
}

function getToolParts(message: UIMessage | undefined) {
  return (
    message?.parts.filter(part => part.type.startsWith('tool-')) ?? []
  ).map(part => part as { type: string; state?: string; errorText?: string });
}

function errorHasFinishReason(error: unknown, finishReason: FinishReason) {
  return (
    typeof error === 'object' &&
    error != null &&
    'finishReason' in error &&
    error.finishReason === finishReason
  );
}

async function checkStreamTextExecutableTools(
  finishReason: (typeof skippedFinishReasons)[number],
  failures: Failure[],
) {
  let executed = 0;
  let onEndMessage: UIMessage | undefined;

  const result = streamText({
    model: new MockLanguageModelV4({
      doStream: async () => ({
        stream: simulateReadableStream({
          chunks: [
            { type: 'stream-start', warnings: [] },
            {
              type: 'tool-call',
              toolCallId: `save-${finishReason}`,
              toolName: 'saveNote',
              input: '{"text":"hello"}',
            },
            {
              type: 'tool-call',
              toolCallId: `archive-${finishReason}`,
              toolName: 'archiveNote',
              input: '{"text":"hello"}',
            },
            {
              type: 'finish',
              finishReason: { unified: finishReason, raw: finishReason },
              usage,
            },
          ],
        }),
      }),
    }),
    prompt: 'save and archive a note',
    tools: {
      saveNote: tool({
        inputSchema: toolInputSchema,
        execute: async () => {
          executed++;
          return 'saved';
        },
      }),
      archiveNote: tool({
        inputSchema: toolInputSchema,
        execute: async () => {
          executed++;
          return 'archived';
        },
      }),
    },
  });

  let streamedMessage: UIMessage | undefined;
  for await (const current of readUIMessageStream({
    stream: result.toUIMessageStream({
      onEnd: event => {
        onEndMessage = event.responseMessage;
      },
    }),
  })) {
    streamedMessage = current;
  }

  const responseMessages = (await result.response).messages;
  const content = await result.content;
  const toolErrors = content.filter(part => part.type === 'tool-error');
  const streamedToolParts = getToolParts(streamedMessage);
  const onEndToolParts = getToolParts(onEndMessage);
  const scenario = `streamText/${finishReason}`;

  record(
    failures,
    scenario,
    executed === 0,
    'skipped executable tools are not executed',
    { executed },
  );
  record(
    failures,
    scenario,
    streamedToolParts.length === 2 &&
      streamedToolParts.every(part => part.state === 'output-error'),
    'every streamed UI tool part ends in output-error',
    streamedToolParts,
  );
  record(
    failures,
    scenario,
    onEndToolParts.length === 2 &&
      onEndToolParts.every(part => part.state === 'output-error'),
    'onEnd receives a responseMessage with every tool part resolved',
    onEndToolParts,
  );
  record(
    failures,
    scenario,
    toolErrors.length === 2 &&
      toolErrors.every(part => errorHasFinishReason(part.error, finishReason)),
    'every skipped call becomes a tool-error carrying its finish reason',
    toolErrors,
  );
  record(
    failures,
    scenario,
    responseMessages.some(message => message.role === 'tool'),
    'response.messages pairs the assistant tool calls with a tool message',
    responseMessages.map(message => message.role),
  );
}

async function checkGenerateTextExecutableTools(
  finishReason: (typeof skippedFinishReasons)[number],
  failures: Failure[],
) {
  let executed = 0;

  const result = await generateText({
    model: new MockLanguageModelV4({
      doGenerate: async () => ({
        content: [
          {
            type: 'tool-call',
            toolCallId: `save-${finishReason}`,
            toolName: 'saveNote',
            input: '{"text":"hello"}',
          },
          {
            type: 'tool-call',
            toolCallId: `archive-${finishReason}`,
            toolName: 'archiveNote',
            input: '{"text":"hello"}',
          },
        ],
        finishReason: { unified: finishReason, raw: finishReason },
        usage,
        warnings: [],
      }),
    }),
    prompt: 'save and archive a note',
    tools: {
      saveNote: tool({
        inputSchema: toolInputSchema,
        execute: async () => {
          executed++;
          return 'saved';
        },
      }),
      archiveNote: tool({
        inputSchema: toolInputSchema,
        execute: async () => {
          executed++;
          return 'archived';
        },
      }),
    },
  });

  const toolErrors = result.content.filter(part => part.type === 'tool-error');
  const scenario = `generateText/${finishReason}`;

  record(
    failures,
    scenario,
    executed === 0,
    'skipped executable tools are not executed',
    { executed },
  );
  record(
    failures,
    scenario,
    toolErrors.length === 2 &&
      toolErrors.every(part => errorHasFinishReason(part.error, finishReason)),
    'every skipped call becomes a tool-error carrying its finish reason',
    toolErrors,
  );
  record(
    failures,
    scenario,
    result.response.messages.some(message => message.role === 'tool'),
    'response.messages pairs the assistant tool calls with a tool message',
    result.response.messages.map(message => message.role),
  );
}

async function checkToolWithoutExecute(failures: Failure[]) {
  const tools = {
    clientTool: tool({
      inputSchema: toolInputSchema,
    }),
  };

  const streamResult = streamText({
    model: new MockLanguageModelV4({
      doStream: async () => ({
        stream: simulateReadableStream({
          chunks: [
            { type: 'stream-start', warnings: [] },
            {
              type: 'tool-call',
              toolCallId: 'client-stream',
              toolName: 'clientTool',
              input: '{"text":"hello"}',
            },
            {
              type: 'finish',
              finishReason: { unified: 'length', raw: 'length' },
              usage,
            },
          ],
        }),
      }),
    }),
    prompt: 'call the client tool',
    tools,
  });

  let streamedMessage: UIMessage | undefined;
  for await (const current of readUIMessageStream({
    stream: streamResult.toUIMessageStream(),
  })) {
    streamedMessage = current;
  }

  const streamToolParts = getToolParts(streamedMessage);
  const streamResponseRoles = (await streamResult.response).messages.map(
    message => message.role,
  );

  record(
    failures,
    'streamText/client-tool',
    streamToolParts.length === 1 &&
      streamToolParts[0].state === 'input-available',
    'a tool without execute remains input-available for client output',
    streamToolParts,
  );
  record(
    failures,
    'streamText/client-tool',
    streamResponseRoles.length === 1 && streamResponseRoles[0] === 'assistant',
    'a tool without execute does not get a synthetic tool result',
    streamResponseRoles,
  );

  const generateResult = await generateText({
    model: new MockLanguageModelV4({
      doGenerate: async () => ({
        content: [
          {
            type: 'tool-call',
            toolCallId: 'client-generate',
            toolName: 'clientTool',
            input: '{"text":"hello"}',
          },
        ],
        finishReason: { unified: 'length', raw: 'length' },
        usage,
        warnings: [],
      }),
    }),
    prompt: 'call the client tool',
    tools,
  });

  record(
    failures,
    'generateText/client-tool',
    generateResult.content.every(part => part.type !== 'tool-error'),
    'a tool without execute does not get a synthetic tool-error',
    generateResult.content,
  );
  record(
    failures,
    'generateText/client-tool',
    generateResult.response.messages.length === 1 &&
      generateResult.response.messages[0].role === 'assistant',
    'a tool without execute remains available for a later client result',
    generateResult.response.messages.map(message => message.role),
  );
}

async function main() {
  const failures: Failure[] = [];

  for (const finishReason of skippedFinishReasons) {
    await checkStreamTextExecutableTools(finishReason, failures);
    await checkGenerateTextExecutableTools(finishReason, failures);
  }

  await checkToolWithoutExecute(failures);

  if (failures.length > 0) {
    console.error(
      'ISSUE_22912_REPRODUCED: skipped executable tool calls remain unresolved after disallowed finish reasons',
    );
    console.error(JSON.stringify(failures, null, 2));
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error('REPRODUCTION_HARNESS_ERROR');
  console.error(error);
  process.exitCode = 2;
});
