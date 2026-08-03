import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

type ToolCallDelta = {
  index?: number;
  id?: string;
  type?: 'function';
  function?: {
    name?: string;
    arguments?: string;
  };
};

type StreamPart = {
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

function gateway(payloads: unknown[]) {
  const body = `${payloads
    .map(payload => `data: ${JSON.stringify(payload)}\n\n`)
    .join('')}data: [DONE]\n\n`;

  return async () =>
    new Response(body, {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    });
}

async function run(payloads: unknown[]) {
  const model = createOpenAICompatible({
    name: 'issue-18333-gateway',
    baseURL: 'https://gateway.invalid/v1',
    apiKey: 'test',
    fetch: gateway(payloads),
  }).chatModel('gpt-4o-mini');

  const { stream } = await model.doStream({
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

  const parts: StreamPart[] = [];
  const reader = stream.getReader();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      parts.push(value as StreamPart);
    }
    return { parts };
  } catch (error) {
    return { parts, error };
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function toolCalls(parts: StreamPart[]) {
  return parts
    .filter(part => part.type === 'tool-call')
    .map(part => ({ toolCallId: part.toolCallId, input: part.input }));
}

function finished(parts: StreamPart[]) {
  return parts.some(part => part.type === 'finish');
}

async function main() {
  const observations: string[] = [];

  const baseline = await run([
    chunk({
      tool_calls: [
        {
          index: 0,
          id: 'call_baseline',
          type: 'function',
          function: { name: 'read_file', arguments: '{"path":"a.txt"}' },
        },
      ],
    }),
    chunk({}, 'tool_calls'),
  ]);

  const baselineWorked =
    baseline.error == null &&
    finished(baseline.parts) &&
    JSON.stringify(toolCalls(baseline.parts)) ===
      JSON.stringify([
        { toolCallId: 'call_baseline', input: '{"path":"a.txt"}' },
      ]);
  observations.push(`baseline index 0 completed: ${baselineWorked}`);

  const nonZero = await run([
    chunk({ role: 'assistant', content: 'Reading it.' }),
    chunk({
      tool_calls: [
        {
          index: 1,
          id: 'call_non_zero',
          type: 'function',
          function: { name: 'read_file', arguments: '' },
        },
      ],
    }),
    chunk({
      tool_calls: [{ index: 1, function: { arguments: '{"path":"a.txt"}' } }],
    }),
    chunk({}, 'tool_calls'),
  ]);

  const nonZeroCrashed =
    errorMessage(nonZero.error).includes(
      "Cannot read properties of undefined (reading 'hasFinished')",
    ) && !finished(nonZero.parts);
  observations.push(
    `first tool call at index 1 crashed before finish: ${nonZeroCrashed}`,
  );

  const nonContiguous = await run([
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
  ]);

  const nonContiguousCrashed =
    errorMessage(nonContiguous.error).includes(
      "Cannot read properties of undefined (reading 'hasFinished')",
    ) && !finished(nonContiguous.parts);
  observations.push(
    `non-contiguous indexes 0 and 2 crashed before finish: ${nonContiguousCrashed}`,
  );

  const reused = await run([
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
  ]);

  const reusedIndexMerged =
    reused.error == null &&
    finished(reused.parts) &&
    JSON.stringify(toolCalls(reused.parts)) ===
      JSON.stringify([
        {
          toolCallId: 'call_a',
          input: '{"path":"a"}{"path":"b"}',
        },
      ]);
  observations.push(
    `reused index 0 merged distinct call IDs: ${reusedIndexMerged}`,
  );

  const missingIndexes = await run([
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
  ]);

  const missingIndexesThrew =
    errorMessage(missingIndexes.error) === "Expected 'id' to be a string." &&
    !finished(missingIndexes.parts);
  observations.push(
    `index-less continuation threw instead of completing: ${missingIndexesThrew}`,
  );

  const nonZeroThenMissing = await run([
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
  ]);

  const nonZeroThenMissingThrew =
    errorMessage(nonZeroThenMissing.error) ===
      "Expected 'id' to be a string." && !finished(nonZeroThenMissing.parts);
  observations.push(
    `index 7 followed by an index-less continuation threw: ${nonZeroThenMissingThrew}`,
  );

  for (const observation of observations) {
    console.log(observation);
  }

  const reproduced =
    baselineWorked &&
    nonZeroCrashed &&
    nonContiguousCrashed &&
    reusedIndexMerged &&
    missingIndexesThrew &&
    nonZeroThenMissingThrew;

  if (!reproduced) {
    throw new Error(
      'ISSUE 18333 COULD NOT BE FULLY REPRODUCED: one or more reported stream shapes differed',
    );
  }

  console.error(
    'ISSUE 18333 REPRODUCED: sparse indexes crash, reused indexes merge calls, and missing-index continuations throw',
  );
  process.exitCode = 1;
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
