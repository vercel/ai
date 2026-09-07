import { strict as assert } from 'node:assert';
import { generateText, streamText, ToolChoiceViolationError, tool } from 'ai';
import type { LanguageModelV4StreamPart } from '@ai-sdk/provider';
import { MockLanguageModelV4 } from 'ai/test';
import { z } from 'zod/v4';

const usage = {
  inputTokens: {
    total: 3,
    noCache: 3,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: {
    total: 10,
    text: 10,
    reasoning: undefined,
  },
};

type ToolChoice = 'required' | { type: 'tool'; toolName: 'tool1' };

function unwrapError(value: unknown): unknown {
  return typeof value === 'object' && value != null && 'error' in value
    ? value.error
    : value;
}

function isViolation(value: unknown): boolean {
  return ToolChoiceViolationError.isInstance(unwrapError(value));
}

function createStream(
  parts: LanguageModelV4StreamPart[],
): ReadableStream<LanguageModelV4StreamPart> {
  return new ReadableStream({
    start(controller) {
      for (const part of parts) {
        controller.enqueue(part);
      }
      controller.close();
    },
  });
}

async function runInvalidStream({
  toolChoice,
  streamParts,
}: {
  toolChoice: ToolChoice;
  streamParts: LanguageModelV4StreamPart[];
}) {
  const errors: unknown[] = [];
  let providerCalls = 0;
  let onFinishCalls = 0;

  const model = new MockLanguageModelV4({
    doStream: async () => {
      providerCalls++;
      return {
        stream: createStream(streamParts),
      };
    },
  });

  const result = streamText({
    model,
    tools: {
      tool1: tool({ inputSchema: z.object({ value: z.string() }) }),
      tool2: tool({ inputSchema: z.object({ value: z.string() }) }),
    },
    toolChoice,
    prompt: 'test-input',
    onError: event => errors.push(event),
    onFinish: () => {
      onFinishCalls++;
    },
  });

  await result.consumeStream({
    onError: error => errors.push(error),
  });

  let finishReason: string | undefined;
  try {
    finishReason = await result.finishReason;
  } catch (error) {
    errors.push(error);
  }

  let text: string | undefined;
  try {
    text = await result.text;
  } catch (error) {
    errors.push(error);
  }

  return {
    errors,
    finishReason,
    onFinishCalls,
    providerCalls,
    text,
  };
}

async function verifyGenerateTextControl() {
  let providerCalls = 0;

  const error = await generateText({
    model: new MockLanguageModelV4({
      doGenerate: async () => {
        providerCalls++;
        return {
          content: [{ type: 'text', text: 'No tool call.' }],
          finishReason: { unified: 'stop', raw: 'stop' },
          usage,
          warnings: [],
        };
      },
    }),
    tools: {
      tool1: tool({ inputSchema: z.object({ value: z.string() }) }),
    },
    toolChoice: 'required',
    prompt: 'test-input',
  }).catch(error => error);

  assert.equal(
    ToolChoiceViolationError.isInstance(error),
    true,
    'generateText control did not reject with ToolChoiceViolationError',
  );
  assert.equal(
    providerCalls,
    1,
    'generateText control called the provider twice',
  );
}

async function verifyValidStreamControl() {
  const errors: unknown[] = [];
  let providerCalls = 0;

  const result = streamText({
    model: new MockLanguageModelV4({
      doStream: async () => {
        providerCalls++;
        return {
          stream: createStream([
            { type: 'stream-start', warnings: [] },
            {
              type: 'tool-call',
              toolCallId: 'call-1',
              toolName: 'tool1',
              input: '{"value":"ok"}',
            },
            {
              type: 'finish',
              finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
              usage,
            },
          ]),
        };
      },
    }),
    tools: {
      tool1: tool({ inputSchema: z.object({ value: z.string() }) }),
    },
    toolChoice: 'required',
    prompt: 'test-input',
    onError: event => errors.push(event),
  });

  await result.consumeStream({
    onError: error => errors.push(error),
  });

  assert.equal(
    await result.finishReason,
    'tool-calls',
    'valid tool-call stream did not complete normally',
  );
  assert.equal(errors.length, 0, 'valid tool-call stream surfaced an error');
  assert.equal(
    providerCalls,
    1,
    'valid tool-call stream called the provider twice',
  );
}

async function main() {
  await verifyGenerateTextControl();
  await verifyValidStreamControl();

  const required = await runInvalidStream({
    toolChoice: 'required',
    streamParts: [
      { type: 'stream-start', warnings: [] },
      { type: 'text-start', id: '1' },
      { type: 'text-delta', id: '1', delta: 'No tool call.' },
      { type: 'text-end', id: '1' },
      {
        type: 'finish',
        finishReason: { unified: 'stop', raw: 'stop' },
        usage,
      },
    ],
  });

  const specific = await runInvalidStream({
    toolChoice: { type: 'tool', toolName: 'tool1' },
    streamParts: [
      { type: 'stream-start', warnings: [] },
      {
        type: 'tool-call',
        toolCallId: 'call-2',
        toolName: 'tool2',
        input: '{"value":"wrong tool"}',
      },
      {
        type: 'finish',
        finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
        usage,
      },
    ],
  });

  console.log(
    JSON.stringify(
      {
        required: {
          finishReason: required.finishReason,
          text: required.text,
          onFinishCalls: required.onFinishCalls,
          onErrorCalls: required.errors.length,
          providerCalls: required.providerCalls,
          toolChoiceViolation: required.errors.some(isViolation),
        },
        specific: {
          finishReason: specific.finishReason,
          onFinishCalls: specific.onFinishCalls,
          onErrorCalls: specific.errors.length,
          providerCalls: specific.providerCalls,
          toolChoiceViolation: specific.errors.some(isViolation),
        },
      },
      null,
      2,
    ),
  );

  assert.equal(required.providerCalls, 1);
  assert.equal(specific.providerCalls, 1);

  if (
    !required.errors.some(isViolation) ||
    !specific.errors.some(isViolation)
  ) {
    throw new Error(
      'ISSUE_20424_REPRODUCED: streamText completed without ToolChoiceViolationError for an enforced tool choice',
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
