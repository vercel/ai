import {
  createAgentUIStream,
  DirectChatTransport,
  type InferAgentUIMessage,
  ToolLoopAgent,
  tool,
} from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { z } from 'zod/v4';

const missingToolInvocationError =
  'AI_UIMessageStreamError: No tool invocation found for tool call ID "call-1".';
const reproductionSignal =
  'ISSUE #21118 REPRODUCED: DirectChatTransport failed the approved tool continuation when onEnd was set.';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function createScenario() {
  let executions = 0;

  const agent = new ToolLoopAgent({
    model: new MockLanguageModelV4({
      doStream: async () => ({
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue({ type: 'stream-start', warnings: [] });
            controller.enqueue({ type: 'text-start', id: 'text-1' });
            controller.enqueue({
              type: 'text-delta',
              id: 'text-1',
              delta: 'Done.',
            });
            controller.enqueue({ type: 'text-end', id: 'text-1' });
            controller.enqueue({
              type: 'finish',
              finishReason: { unified: 'stop', raw: 'stop' },
              usage: {
                inputTokens: {
                  total: 1,
                  noCache: 1,
                  cacheRead: 0,
                  cacheWrite: 0,
                },
                outputTokens: { total: 1, text: 1, reasoning: 0 },
              },
            });
            controller.close();
          },
        }),
      }),
    }),
    maxRetries: 0,
    tools: {
      lookup: tool({
        inputSchema: z.object({}),
        needsApproval: true,
        execute: async () => {
          executions++;
          return 'ok';
        },
      }),
    },
  });

  const messages: InferAgentUIMessage<typeof agent>[] = [
    {
      id: 'user-1',
      role: 'user',
      parts: [{ type: 'text', text: 'Run the lookup.' }],
    },
    {
      id: 'assistant-1',
      role: 'assistant',
      parts: [
        {
          type: 'tool-lookup',
          toolCallId: 'call-1',
          input: {},
          state: 'approval-responded',
          approval: {
            id: 'approval-1',
            approved: true,
          },
        },
      ],
    },
  ];

  return {
    agent,
    messages,
    getExecutions: () => executions,
  };
}

async function consume(stream: ReadableStream<unknown>) {
  const chunks: unknown[] = [];
  const reader = stream.getReader();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        return chunks;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
}

function assertCompletedContinuation({
  chunks,
  executions,
  onEndEvent,
  label,
}: {
  chunks: unknown[];
  executions: number;
  onEndEvent?: any;
  label: string;
}) {
  assert(
    executions === 1,
    `${label}: expected the approved tool to execute once`,
  );
  assert(
    chunks.some(
      (chunk: any) =>
        chunk.type === 'tool-output-available' &&
        chunk.toolCallId === 'call-1' &&
        chunk.output === 'ok',
    ),
    `${label}: expected the stream to emit the approved tool output`,
  );

  if (onEndEvent == null) {
    return;
  }

  assert(onEndEvent.isContinuation, `${label}: expected a continuation`);
  assert(
    onEndEvent.responseMessage.id === 'assistant-1',
    `${label}: expected onEnd to continue assistant-1`,
  );
  assert(
    onEndEvent.responseMessage.parts.some(
      (part: any) =>
        part.type === 'tool-lookup' &&
        part.toolCallId === 'call-1' &&
        part.state === 'output-available' &&
        part.output === 'ok',
    ),
    `${label}: expected onEnd to receive the continued tool output`,
  );
  assert(
    onEndEvent.responseMessage.parts.some(
      (part: any) => part.type === 'text' && part.text === 'Done.',
    ),
    `${label}: expected onEnd to receive the continued assistant text`,
  );
}

async function runWithoutOnEndControl() {
  const scenario = createScenario();
  const transport = new DirectChatTransport({ agent: scenario.agent });
  const chunks = await consume(
    await transport.sendMessages({
      chatId: 'chat-1',
      messages: scenario.messages,
      trigger: 'submit-message',
      messageId: 'assistant-1',
      abortSignal: undefined,
    }),
  );

  assertCompletedContinuation({
    chunks,
    executions: scenario.getExecutions(),
    label: 'DirectChatTransport without onEnd',
  });
}

async function runExplicitOriginalMessagesControl() {
  const scenario = createScenario();
  let onEndEvent: any;
  const transport = new DirectChatTransport({
    agent: scenario.agent,
    originalMessages: scenario.messages,
    onEnd: event => {
      onEndEvent = event;
    },
  });
  const chunks = await consume(
    await transport.sendMessages({
      chatId: 'chat-1',
      messages: scenario.messages,
      trigger: 'submit-message',
      messageId: 'assistant-1',
      abortSignal: undefined,
    }),
  );

  assertCompletedContinuation({
    chunks,
    executions: scenario.getExecutions(),
    onEndEvent,
    label: 'DirectChatTransport with explicit originalMessages',
  });
}

async function runCreateAgentUIStreamControl() {
  const scenario = createScenario();
  let onEndEvent: any;
  const chunks = await consume(
    await createAgentUIStream({
      agent: scenario.agent,
      uiMessages: scenario.messages,
      onEnd: event => {
        onEndEvent = event;
      },
    }),
  );

  assertCompletedContinuation({
    chunks,
    executions: scenario.getExecutions(),
    onEndEvent,
    label: 'createAgentUIStream',
  });
}

async function runReportedScenario() {
  const scenario = createScenario();
  let onEndEvent: any;
  const transport = new DirectChatTransport({
    agent: scenario.agent,
    onEnd: event => {
      onEndEvent = event;
    },
  });
  let chunks: unknown[];
  try {
    chunks = await consume(
      await transport.sendMessages({
        chatId: 'chat-1',
        messages: scenario.messages,
        trigger: 'submit-message',
        messageId: 'assistant-1',
        abortSignal: undefined,
      }),
    );
  } catch (error) {
    if (String(error).includes(missingToolInvocationError)) {
      assert(
        scenario.getExecutions() === 1,
        'DirectChatTransport with onEnd: expected the tool to execute before the stream failure',
      );
      throw new Error(reproductionSignal, { cause: error });
    }
    throw error;
  }

  assertCompletedContinuation({
    chunks,
    executions: scenario.getExecutions(),
    onEndEvent,
    label: 'DirectChatTransport with onEnd',
  });
}

async function main() {
  await runWithoutOnEndControl();
  await runExplicitOriginalMessagesControl();
  await runCreateAgentUIStreamControl();
  await runReportedScenario();

  console.log('Issue #21118 is not reproduced.');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
