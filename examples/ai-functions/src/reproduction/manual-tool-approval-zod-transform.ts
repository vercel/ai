import type {
  LanguageModelV3StreamPart,
  LanguageModelV3StreamResult,
} from '@ai-sdk/provider';
import { generateText, streamText, tool, type ModelMessage } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';
import { z as z3 } from 'zod/v3';
import { z as z4 } from 'zod/v4';

const usage = {
  inputTokens: {
    total: 1,
    noCache: 1,
    cacheRead: 0,
    cacheWrite: 0,
  },
  outputTokens: {
    total: 1,
    text: 1,
    reasoning: 0,
  },
};

function readableStream(
  parts: LanguageModelV3StreamPart[],
): LanguageModelV3StreamResult {
  return {
    stream: new ReadableStream({
      start(controller) {
        for (const part of parts) {
          controller.enqueue(part);
        }
        controller.close();
      },
    }),
  };
}

function persisted(messages: ModelMessage[]): ModelMessage[] {
  return JSON.parse(JSON.stringify(messages)) as ModelMessage[];
}

function hasInvalidInputToolResult(messages: ModelMessage[]): boolean {
  return messages.some(
    message =>
      message.role === 'tool' &&
      message.content.some(
        part =>
          part.type === 'tool-result' &&
          part.output.type === 'error-text' &&
          part.output.value.includes('Invalid input for tool'),
      ),
  );
}

async function reproduceGenerateText() {
  let executions = 0;
  let executedInput: unknown;

  const tools = {
    count: tool({
      inputSchema: z4.object({
        count: z4.string().transform(Number),
      }),
      needsApproval: true,
      execute: async input => {
        executions++;
        executedInput = input;
        return input;
      },
    }),
  };

  const model = new MockLanguageModelV3({
    doGenerate: [
      {
        content: [
          {
            type: 'tool-call',
            toolCallId: 'generate-count-call',
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
  });
  const request = first.content.find(
    part => part.type === 'tool-approval-request',
  );
  if (request == null) {
    throw new Error('Expected generateText to request tool approval');
  }

  const second = await generateText({
    model,
    tools,
    maxRetries: 0,
    messages: [
      ...messages,
      ...persisted(first.response.messages),
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

  return {
    approvalInput: first.toolCalls[0]?.input,
    executions,
    executedInput,
    invalidInputToolResult: hasInvalidInputToolResult(second.response.messages),
  };
}

async function reproduceStreamText() {
  let executions = 0;
  let executedInput: unknown;

  const tools = {
    reshape: tool({
      inputSchema: z3
        .object({ value: z3.string() })
        .transform(({ value }) => ({ count: Number(value) })),
      needsApproval: true,
      execute: async input => {
        executions++;
        executedInput = input;
        return input;
      },
    }),
  };

  const model = new MockLanguageModelV3({
    doStream: [
      readableStream([
        {
          type: 'tool-call',
          toolCallId: 'stream-reshape-call',
          toolName: 'reshape',
          input: '{"value":"4"}',
        },
        {
          type: 'finish',
          finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
          usage,
        },
      ]),
      readableStream([
        { type: 'text-start', id: 'text-1' },
        { type: 'text-delta', id: 'text-1', delta: 'Done' },
        { type: 'text-end', id: 'text-1' },
        {
          type: 'finish',
          finishReason: { unified: 'stop', raw: 'stop' },
          usage,
        },
      ]),
    ],
  });

  const messages: ModelMessage[] = [
    { role: 'user', content: 'Reshape four items.' },
  ];

  const first = streamText({
    model,
    tools,
    messages,
    maxRetries: 0,
  });
  const firstContent = await first.content;
  const request = firstContent.find(
    part => part.type === 'tool-approval-request',
  );
  if (request == null) {
    throw new Error('Expected streamText to request tool approval');
  }

  const second = streamText({
    model,
    tools,
    maxRetries: 0,
    messages: [
      ...messages,
      ...persisted((await first.response).messages),
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

  return {
    approvalInput: (await first.toolCalls)[0]?.input,
    executions,
    executedInput,
    invalidInputToolResult: hasInvalidInputToolResult(
      (await second.response).messages,
    ),
  };
}

async function main() {
  const generateResult = await reproduceGenerateText();
  const streamResult = await reproduceStreamText();

  console.log('generateText:', JSON.stringify(generateResult));
  console.log('streamText:', JSON.stringify(streamResult));

  if (generateResult.executions !== 1 || streamResult.executions !== 1) {
    throw new Error(
      `Issue #21091 reproduced: approved transformed tools should execute once; generateText=${generateResult.executions}, streamText=${streamResult.executions}`,
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
