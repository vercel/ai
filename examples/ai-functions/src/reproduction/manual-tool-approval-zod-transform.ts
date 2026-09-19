import type { LanguageModelV4StreamPart } from '@ai-sdk/provider';
import { parseJSON } from '@ai-sdk/provider-utils';
import { generateText, streamText, tool, type ModelMessage } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { z as z3 } from 'zod/v3';
import { z as z4 } from 'zod/v4';

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};

function createStream(parts: LanguageModelV4StreamPart[]) {
  return new ReadableStream<LanguageModelV4StreamPart>({
    start(controller) {
      for (const part of parts) {
        controller.enqueue(part);
      }
      controller.close();
    },
  });
}

async function verifyNonManualControls() {
  for (const approval of ['none', 'automatic'] as const) {
    let executions = 0;

    await generateText({
      model: new MockLanguageModelV4({
        doGenerate: {
          content: [
            {
              type: 'tool-call',
              toolCallId: `${approval}-call`,
              toolName: 'count',
              input: '{"count":"3"}',
            },
          ],
          finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
          usage,
          warnings: [],
        },
      }),
      tools: {
        count: tool({
          inputSchema: z4.object({
            count: z4.string().transform(Number),
          }),
          execute: async ({ count }) => {
            executions++;
            return { count };
          },
        }),
      },
      maxRetries: 0,
      prompt: 'Count three items.',
      ...(approval === 'automatic'
        ? { toolApproval: { count: 'approved' as const } }
        : {}),
    });

    if (executions !== 1) {
      throw new Error(
        `Control failed: ${approval} approval executed the transformed tool ${executions} times`,
      );
    }
  }
}

async function verifyManualPassingControls() {
  const cases = [
    {
      name: 'plain number',
      inputSchema: z4.object({ count: z4.number() }),
      modelInput: '{"count":3}',
    },
    {
      name: 'coercion',
      inputSchema: z4.object({ count: z4.coerce.number() }),
      modelInput: '{"count":"3"}',
    },
    {
      name: 'default',
      inputSchema: z4.object({ count: z4.number().default(3) }),
      modelInput: '{}',
    },
  ];

  for (const control of cases) {
    let executions = 0;
    const tools = {
      count: tool({
        inputSchema: control.inputSchema,
        execute: async () => {
          executions++;
          return { count: 3 };
        },
      }),
    };
    const model = new MockLanguageModelV4({
      doGenerate: [
        {
          content: [
            {
              type: 'tool-call',
              toolCallId: `${control.name}-call`,
              toolName: 'count',
              input: control.modelInput,
            },
          ],
          finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
          usage,
          warnings: [],
        },
        {
          content: [{ type: 'text', text: 'Done' }],
          finishReason: { unified: 'stop', raw: 'stop' },
          usage,
          warnings: [],
        },
      ],
    });
    const messages: ModelMessage[] = [
      { role: 'user', content: 'Count three items.' },
    ];
    const first = await generateText({
      model,
      tools,
      messages,
      maxRetries: 0,
      toolApproval: { count: 'user-approval' },
    });
    const request = first.content.find(
      part => part.type === 'tool-approval-request',
    );

    if (request == null) {
      throw new Error(
        `Control failed: ${control.name} expected an approval request`,
      );
    }

    await generateText({
      model,
      tools,
      maxRetries: 0,
      toolApproval: { count: 'user-approval' },
      messages: [
        ...messages,
        ...first.responseMessages,
        {
          role: 'tool',
          content: [
            {
              type: 'tool-approval-response',
              approvalId: request.approvalId,
              approved: true,
            },
          ],
        },
      ],
    });

    if (executions !== 1) {
      throw new Error(
        `Control failed: ${control.name} manual approval executed the tool ${executions} times`,
      );
    }
  }
}

async function reproduceGenerateText() {
  let executions = 0;

  const tools = {
    count: tool({
      inputSchema: z4.object({ count: z4.string().transform(Number) }),
      execute: async ({ count }) => {
        executions++;
        return { count };
      },
    }),
  };

  const model = new MockLanguageModelV4({
    doGenerate: [
      {
        content: [
          {
            type: 'tool-call',
            toolCallId: 'count-call',
            toolName: 'count',
            input: '{"count":"3"}',
          },
        ],
        finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
        usage,
        warnings: [],
      },
      {
        content: [{ type: 'text', text: 'Done' }],
        finishReason: { unified: 'stop', raw: 'stop' },
        usage,
        warnings: [],
      },
    ],
  });

  const messages: ModelMessage[] = [
    { role: 'user', content: 'Count three items.' },
  ];

  const first = await generateText({
    model,
    tools,
    messages,
    maxRetries: 0,
    toolApproval: { count: 'user-approval' },
  });

  const request = first.content.find(
    part => part.type === 'tool-approval-request',
  );

  if (request == null) {
    throw new Error('Precondition failed: expected an approval request');
  }

  const approvalInput = first.toolCalls[0]?.input;

  if (
    approvalInput == null ||
    typeof approvalInput !== 'object' ||
    !('count' in approvalInput) ||
    approvalInput.count !== 3
  ) {
    throw new Error(
      'Precondition failed: expected transformed approval input { count: 3 }',
    );
  }

  const second = await generateText({
    model,
    tools,
    maxRetries: 0,
    toolApproval: { count: 'user-approval' },
    messages: [
      ...messages,
      ...first.responseMessages,
      {
        role: 'tool',
        content: [
          {
            type: 'tool-approval-response',
            approvalId: request.approvalId,
            approved: true,
          },
        ],
      },
    ],
  });

  const resumedMessages = JSON.stringify(second.responseMessages);

  return {
    api: 'generateText',
    executions,
    invalidTransformedInput:
      executions === 0 &&
      /expected string, received number/i.test(resumedMessages),
    resumedMessages,
  };
}

async function reproduceStreamText() {
  let executions = 0;

  const tools = {
    count: tool({
      inputSchema: z3
        .object({ raw: z3.string() })
        .transform(({ raw }) => ({ raw: Number(raw), count: Number(raw) })),
      execute: async input => {
        executions++;
        return input;
      },
    }),
  };

  const model = new MockLanguageModelV4({
    doStream: [
      {
        stream: createStream([
          { type: 'stream-start', warnings: [] },
          {
            type: 'tool-call',
            toolCallId: 'stream-count-call',
            toolName: 'count',
            input: '{"raw":"3"}',
          },
          {
            type: 'finish',
            finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
            usage,
          },
        ]),
      },
      {
        stream: createStream([
          { type: 'stream-start', warnings: [] },
          { type: 'text-start', id: 'text-1' },
          { type: 'text-delta', id: 'text-1', delta: 'Done' },
          { type: 'text-end', id: 'text-1' },
          {
            type: 'finish',
            finishReason: { unified: 'stop', raw: 'stop' },
            usage,
          },
        ]),
      },
    ],
  });

  const messages: ModelMessage[] = [
    { role: 'user', content: 'Count three items.' },
  ];

  const first = streamText({
    model,
    tools,
    messages,
    maxRetries: 0,
    toolApproval: { count: 'user-approval' },
  });

  const [content, responseMessages] = await Promise.all([
    first.content,
    first.responseMessages,
  ]);
  const request = content.find(part => part.type === 'tool-approval-request');
  const toolCall = content.find(part => part.type === 'tool-call');

  if (request == null) {
    throw new Error(
      'Precondition failed: streamText expected an approval request',
    );
  }

  const approvalInput = toolCall?.input;

  if (
    approvalInput == null ||
    typeof approvalInput !== 'object' ||
    !('raw' in approvalInput) ||
    approvalInput.raw !== 3 ||
    !('count' in approvalInput) ||
    approvalInput.count !== 3
  ) {
    throw new Error(
      'Precondition failed: streamText expected reshaped approval input { raw: 3, count: 3 }',
    );
  }

  const persistedResponseMessages = (await parseJSON({
    text: JSON.stringify(responseMessages),
  })) as ModelMessage[];

  const second = streamText({
    model,
    tools,
    maxRetries: 0,
    toolApproval: { count: 'user-approval' },
    messages: [
      ...messages,
      ...persistedResponseMessages,
      {
        role: 'tool',
        content: [
          {
            type: 'tool-approval-response',
            approvalId: request.approvalId,
            approved: true,
          },
        ],
      },
    ],
  });

  await second.consumeStream();
  const resumedMessages = JSON.stringify(await second.responseMessages);

  return {
    api: 'streamText',
    executions,
    invalidTransformedInput:
      executions === 0 &&
      /expected string, received number/i.test(resumedMessages),
    resumedMessages,
  };
}

async function main() {
  await verifyNonManualControls();
  await verifyManualPassingControls();

  const outcomes = [await reproduceGenerateText(), await reproduceStreamText()];
  const failures = outcomes.filter(outcome => outcome.executions !== 1);

  if (failures.length === 0) {
    return;
  }

  if (
    failures.length === outcomes.length &&
    failures.every(
      outcome =>
        outcome.executions === 0 && outcome.invalidTransformedInput === true,
    )
  ) {
    throw new Error(
      'ISSUE #21091 REPRODUCED: approved transformed tool input was rejected and the tool executed 0 times',
    );
  }

  throw new Error(
    `Unexpected result: ${failures
      .map(
        outcome =>
          `${outcome.api} executed ${outcome.executions} times; resumed messages: ${outcome.resumedMessages}`,
      )
      .join(' | ')}`,
  );
}

main();
