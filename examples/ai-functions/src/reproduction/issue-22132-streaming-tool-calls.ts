import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { streamText, tool } from 'ai';
import { z } from 'zod';

const failureSignal =
  'ISSUE_22132_REPRODUCED: parallel same-tool calls were merged or dropped';

type ToolCallDelta = {
  index?: number;
  id?: string;
  type?: 'function';
  function: {
    name?: string;
    arguments: string;
  };
};

type ObservedToolCall = {
  toolCallId: string;
  input: unknown;
  invalid: boolean;
};

function chunk(toolCalls: ToolCallDelta[] | null, finishReason: string | null) {
  return {
    id: 'c1',
    object: 'chat.completion.chunk',
    created: 0,
    model: 'm',
    choices: [
      {
        index: 0,
        delta:
          toolCalls == null
            ? { role: 'assistant' as const }
            : { tool_calls: toolCalls },
        finish_reason: finishReason,
      },
    ],
  };
}

function call(
  index: number | undefined,
  id: string | undefined,
  name: string | undefined,
  argumentsDelta: string,
): ToolCallDelta {
  return {
    ...(index === undefined ? {} : { index }),
    ...(id === undefined ? {} : { id, type: 'function' as const }),
    function: {
      ...(name === undefined ? {} : { name }),
      arguments: argumentsDelta,
    },
  };
}

const toolName = 'get_weather';

const shapes: Record<string, ToolCallDelta[][]> = {
  'A) distinct increasing indexes': [
    [call(0, 'call_a', toolName, '')],
    [call(0, undefined, undefined, '{"city":"Berlin"}')],
    [call(1, 'call_b', toolName, '')],
    [call(1, undefined, undefined, '{"city":"Paris"}')],
  ],
  'B2) reused index with id on every fragment': [
    [call(0, 'call_a', toolName, '')],
    [call(0, 'call_a', undefined, '{"city":"Berlin"}')],
    [call(0, 'call_b', toolName, '')],
    [call(0, 'call_b', undefined, '{"city":"Paris"}')],
  ],
  'C) reused index with id only on opening fragments': [
    [call(0, 'call_a', toolName, '')],
    [call(0, undefined, undefined, '{"city":"Berlin"}')],
    [call(0, 'call_b', toolName, '')],
    [call(0, undefined, undefined, '{"city":"Paris"}')],
  ],
  'D) continuation fragments omit id and index': [
    [call(0, 'call_a', toolName, '')],
    [call(undefined, undefined, undefined, '{"city":"Berlin"}')],
    [call(1, 'call_b', toolName, '')],
    [call(undefined, undefined, undefined, '{"city":"Paris"}')],
  ],
};

async function runShape(groups: ToolCallDelta[][]) {
  const events = [
    chunk(null, null),
    ...groups.map(group => chunk(group, null)),
    chunk(null, 'tool_calls'),
  ];
  const body =
    events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('') +
    'data: [DONE]\n\n';

  const provider = createOpenAICompatible({
    name: 'canned',
    baseURL: 'http://canned.invalid/v1',
    apiKey: 'none',
    fetch: async () =>
      new Response(body, {
        headers: { 'content-type': 'text/event-stream' },
      }),
  });

  const result = streamText({
    model: provider('m'),
    prompt: 'What is the weather in Berlin and Paris?',
    tools: {
      [toolName]: tool({
        inputSchema: z.object({ city: z.string() }),
      }),
    },
  });

  const toolCalls: ObservedToolCall[] = [];
  const errors: string[] = [];

  for await (const part of result.fullStream) {
    if (part.type === 'tool-call') {
      toolCalls.push({
        toolCallId: part.toolCallId,
        input: part.input,
        invalid: part.invalid === true,
      });
    } else if (part.type === 'error' || part.type === 'tool-error') {
      errors.push(String(part.error));
    }
  }

  return { toolCalls, errors };
}

function hasExpectedCalls(result: Awaited<ReturnType<typeof runShape>>) {
  if (result.errors.length !== 0 || result.toolCalls.length !== 2) {
    return false;
  }

  const callsById = new Map(
    result.toolCalls.map(toolCall => [toolCall.toolCallId, toolCall]),
  );

  return (
    callsById.get('call_a')?.invalid === false &&
    JSON.stringify(callsById.get('call_a')?.input) ===
      JSON.stringify({ city: 'Berlin' }) &&
    callsById.get('call_b')?.invalid === false &&
    JSON.stringify(callsById.get('call_b')?.input) ===
      JSON.stringify({ city: 'Paris' })
  );
}

async function main() {
  const results: Record<string, Awaited<ReturnType<typeof runShape>>> = {};
  await Promise.all(
    Object.entries(shapes).map(async ([label, groups]) => {
      results[label] = await runShape(groups);
    }),
  );

  const baseline = results['A) distinct increasing indexes'];
  if (!hasExpectedCalls(baseline)) {
    throw new Error(
      `BASELINE_FAILURE: well-formed indexed stream did not produce two valid calls\n${JSON.stringify(baseline)}`,
    );
  }

  const malformedShapeFailures = Object.entries(results)
    .filter(([label]) => !label.startsWith('A)'))
    .filter(([, result]) => !hasExpectedCalls(result));

  if (malformedShapeFailures.length > 0) {
    throw new Error(
      `${failureSignal}\n${JSON.stringify(Object.fromEntries(malformedShapeFailures))}`,
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
