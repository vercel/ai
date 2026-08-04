import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { readFile } from 'node:fs/promises';
import { streamText } from 'ai';
import { z } from 'zod';

type ToolCallDelta = {
  index?: number;
  id?: string;
  type?: 'function';
  function?: {
    name?: string;
    arguments?: string;
  };
};

type ModelStreamPart = {
  type: string;
  toolCallId?: string;
  input?: string;
};

const chunk = (
  delta: {
    role?: 'assistant';
    content?: string;
    tool_calls?: ToolCallDelta[];
  },
  finishReason: string | null = null,
) => ({
  id: 'chatcmpl-issue-18333',
  object: 'chat.completion.chunk',
  created: 0,
  model: 'gpt-4o-mini',
  choices: [{ index: 0, delta, finish_reason: finishReason }],
});

function sse(payloads: unknown[]) {
  return `${payloads
    .map(payload => `data: ${JSON.stringify(payload)}\n\n`)
    .join('')}data: [DONE]\n\n`;
}

function createModel(trace: string) {
  return createOpenAICompatible({
    name: 'issue-18333-gateway',
    baseURL: 'https://gateway.invalid/v1',
    apiKey: 'test',
    fetch: async () =>
      new Response(trace, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      }),
  }).chatModel('gpt-4o-mini');
}

async function runModelStream(trace: string) {
  const { stream } = await createModel(trace).doStream({
    prompt: [
      {
        role: 'user',
        content: [{ type: 'text', text: 'Read the requested files.' }],
      },
    ],
    tools: [
      {
        type: 'function',
        name: 'read_file',
        inputSchema: {
          type: 'object',
          properties: { path: { type: 'string' } },
        },
      },
    ],
  });

  const parts: ModelStreamPart[] = [];
  const reader = stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        return { parts };
      }
      parts.push(value as ModelStreamPart);
    }
  } catch (error) {
    return { parts, error };
  }
}

async function runCapturedFallback(trace: string) {
  const result = streamText({
    model: createModel(trace),
    maxRetries: 0,
    prompt: 'Read a.txt.',
    tools: {
      read_file: {
        inputSchema: z.object({ path: z.string() }),
      },
    },
  });

  const partTypes: string[] = [];
  const text: string[] = [];
  const toolCalls: Array<{
    toolCallId: string;
    input: { path: string };
  }> = [];
  const errors: unknown[] = [];

  try {
    for await (const part of result.fullStream) {
      partTypes.push(part.type);
      if (part.type === 'text-delta') {
        text.push(part.text);
      } else if (part.type === 'tool-call' && !part.dynamic) {
        toolCalls.push({
          toolCallId: part.toolCallId,
          input: part.input,
        });
      } else if (part.type === 'error') {
        errors.push(part.error);
      }
    }
  } catch (error) {
    errors.push(error);
  }

  let usageResolved = false;
  try {
    await result.usage;
    usageResolved = true;
  } catch (error) {
    errors.push(error);
  }

  return {
    partTypes,
    text: text.join(''),
    toolCalls,
    errors,
    usageResolved,
  };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function modelToolCalls(parts: ModelStreamPart[]) {
  return parts
    .filter(part => part.type === 'tool-call')
    .map(part => ({ toolCallId: part.toolCallId, input: part.input }));
}

function modelFinished(parts: ModelStreamPart[]) {
  return parts.some(part => part.type === 'finish');
}

async function main() {
  const capturedTrace = await readFile(
    new URL(
      './fixtures/issue-18333/gateway-openai-compatible.sse',
      import.meta.url,
    ),
    'utf8',
  );

  const captured = await runCapturedFallback(capturedTrace);
  const capturedIndexOneWorked =
    captured.errors.length === 0 &&
    captured.text === 'Reading it.' &&
    JSON.stringify(captured.toolCalls) ===
      JSON.stringify([
        {
          toolCallId: 'toolu_sanitized',
          input: { path: 'a.txt' },
        },
      ]) &&
    captured.partTypes.includes('finish') &&
    captured.usageResolved;

  const nonContiguous = await runModelStream(
    sse([
      chunk({
        tool_calls: [
          {
            index: 0,
            id: 'call_zero',
            type: 'function',
            function: { name: 'read_file', arguments: '{"path":"a.txt"}' },
          },
        ],
      }),
      chunk({
        tool_calls: [
          {
            index: 2,
            id: 'call_two',
            type: 'function',
            function: { name: 'read_file', arguments: '{"path":"b.txt"}' },
          },
        ],
      }),
      chunk({}, 'tool_calls'),
    ]),
  );
  const nonContiguousWorked =
    nonContiguous.error == null &&
    modelFinished(nonContiguous.parts) &&
    JSON.stringify(modelToolCalls(nonContiguous.parts)) ===
      JSON.stringify([
        { toolCallId: 'call_zero', input: '{"path":"a.txt"}' },
        { toolCallId: 'call_two', input: '{"path":"b.txt"}' },
      ]);

  const reused = await runModelStream(
    sse([
      chunk({
        tool_calls: [
          {
            index: 0,
            id: 'call_a',
            type: 'function',
            function: { name: 'read_file', arguments: '{"path":"a"}' },
          },
        ],
      }),
      chunk({
        tool_calls: [
          {
            index: 0,
            id: 'call_b',
            type: 'function',
            function: { name: 'read_file', arguments: '{"path":"b"}' },
          },
        ],
      }),
      chunk({}, 'tool_calls'),
    ]),
  );
  const reusedIndexMerged =
    reused.error == null &&
    modelFinished(reused.parts) &&
    JSON.stringify(modelToolCalls(reused.parts)) ===
      JSON.stringify([
        {
          toolCallId: 'call_a',
          input: '{"path":"a"}{"path":"b"}',
        },
      ]);

  const missingIndexes = await runModelStream(
    sse([
      chunk({
        tool_calls: [
          {
            id: 'call_missing_indexes',
            type: 'function',
            function: { name: 'read_file', arguments: '{"path":' },
          },
        ],
      }),
      chunk({
        tool_calls: [{ function: { arguments: '"a.txt"}' } }],
      }),
      chunk({}, 'tool_calls'),
    ]),
  );
  const missingIndexesThrew =
    errorMessage(missingIndexes.error) === "Expected 'id' to be a string." &&
    !modelFinished(missingIndexes.parts);

  const nonZeroThenMissing = await runModelStream(
    sse([
      chunk({
        tool_calls: [
          {
            index: 7,
            id: 'call_seven',
            type: 'function',
            function: { name: 'read_file', arguments: '{"path":' },
          },
        ],
      }),
      chunk({
        tool_calls: [{ function: { arguments: '"a.txt"}' } }],
      }),
      chunk({}, 'tool_calls'),
    ]),
  );
  const nonZeroThenMissingThrew =
    errorMessage(nonZeroThenMissing.error) ===
      "Expected 'id' to be a string." &&
    !modelFinished(nonZeroThenMissing.parts);

  console.log(
    `captured fallback index 1 emitted text, tool call, finish, and usage: ${capturedIndexOneWorked}`,
  );
  console.log(
    `non-contiguous indexes 0 and 2 emitted both tool calls and finish: ${nonContiguousWorked}`,
  );
  console.log(
    `reused index 0 still merged distinct call IDs: ${reusedIndexMerged}`,
  );
  console.log(
    `index-less continuation still terminated the stream: ${missingIndexesThrew}`,
  );
  console.log(
    `index 7 followed by an index-less continuation still terminated the stream: ${nonZeroThenMissingThrew}`,
  );

  if (
    !capturedIndexOneWorked ||
    !nonContiguousWorked ||
    !reusedIndexMerged ||
    !missingIndexesThrew ||
    !nonZeroThenMissingThrew
  ) {
    throw new Error(
      'ISSUE 18333 RELEASE-V6.0 CHECK INCONCLUSIVE: one or more stream shapes differed',
    );
  }

  console.log(
    'ISSUE 18333 PRIMARY SPARSE-INDEX CRASH NOT REPRODUCED ON RELEASE-V6.0; REUSED AND MISSING-INDEX SHAPES REMAIN',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
