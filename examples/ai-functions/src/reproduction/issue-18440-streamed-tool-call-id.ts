import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type {
  LanguageModelV3,
  LanguageModelV3StreamPart,
} from '@ai-sdk/provider';

type ProviderKind = 'openai' | 'openai-compatible';

type ToolCallDelta = {
  index?: number;
  id?: string;
  type?: 'function';
  function: {
    name?: string;
    arguments?: string;
  };
};

type ToolCallPart = Extract<LanguageModelV3StreamPart, { type: 'tool-call' }>;

type ScenarioResult = {
  error?: string;
  parts: LanguageModelV3StreamPart[];
};

const prompt = [
  {
    role: 'user' as const,
    content: [{ type: 'text' as const, text: 'Use the requested tools.' }],
  },
];

function createSseResponse(deltas: ToolCallDelta[]): Response {
  const chunks = deltas.map(
    toolCall =>
      `data: ${JSON.stringify({
        id: 'chatcmpl-issue-18440',
        object: 'chat.completion.chunk',
        created: 1,
        model: 'reproduction-model',
        choices: [
          {
            index: 0,
            delta: { tool_calls: [toolCall] },
            finish_reason: null,
          },
        ],
      })}\n\n`,
  );

  chunks.push(
    `data: ${JSON.stringify({
      id: 'chatcmpl-issue-18440',
      object: 'chat.completion.chunk',
      created: 1,
      model: 'reproduction-model',
      choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }],
    })}\n\n`,
    'data: [DONE]\n\n',
  );

  return new Response(chunks.join(''), {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });
}

function createModel(
  providerKind: ProviderKind,
  deltas: ToolCallDelta[],
): LanguageModelV3 {
  const fetch = async () => createSseResponse(deltas);

  if (providerKind === 'openai') {
    return createOpenAI({
      apiKey: 'test-api-key',
      baseURL: 'https://issue-18440.invalid/v1',
      fetch,
    }).chat('gpt-4o-mini');
  }

  return createOpenAICompatible({
    apiKey: 'test-api-key',
    baseURL: 'https://issue-18440.invalid/v1',
    name: 'issue-18440',
    fetch,
  })('reproduction-model');
}

async function runScenario(
  providerKind: ProviderKind,
  deltas: ToolCallDelta[],
): Promise<ScenarioResult> {
  const parts: LanguageModelV3StreamPart[] = [];

  try {
    const { stream } = await createModel(providerKind, deltas).doStream({
      prompt,
    });

    const reader = stream.getReader();
    while (true) {
      const result = await reader.read();
      if (result.done) {
        break;
      }
      parts.push(result.value);
    }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      parts,
    };
  }

  return { parts };
}

function toolCalls(result: ScenarioResult): ToolCallPart[] {
  return result.parts.filter(
    (part): part is ToolCallPart => part.type === 'tool-call',
  );
}

function hasUsableUniqueIds(calls: ToolCallPart[]): boolean {
  const ids = calls.map(call => call.toolCallId);
  return (
    ids.every(id => id.trim().length > 0) && new Set(ids).size === ids.length
  );
}

function callsMatch(
  result: ScenarioResult,
  expected: Array<{ name: string; input: string }>,
): boolean {
  const calls = toolCalls(result);
  return (
    result.error == null &&
    calls.length === expected.length &&
    calls.every(
      (call, index) =>
        call.toolName === expected[index].name &&
        call.input === expected[index].input,
    ) &&
    hasUsableUniqueIds(calls)
  );
}

async function main() {
  const providers: ProviderKind[] = ['openai-compatible', 'openai'];

  const a1 = await Promise.all(
    providers.map(provider =>
      runScenario(provider, [
        {
          index: 0,
          type: 'function',
          function: { name: 'read_file', arguments: '{"path":"p0"}' },
        },
        {
          index: 0,
          type: 'function',
          function: { name: 'write_file', arguments: '{"path":"p1"}' },
        },
        {
          index: 0,
          type: 'function',
          function: { name: 'read_file', arguments: '{"path":"p2"}' },
        },
      ]),
    ),
  );

  const a2 = await Promise.all(
    providers.map(provider =>
      runScenario(provider, [
        {
          index: 0,
          id: 'call_a',
          type: 'function',
          function: { name: 'read_file', arguments: '{"pa' },
        },
        {
          index: 0,
          id: '   ',
          type: 'function',
          function: { arguments: 'th":"a"}' },
        },
      ]),
    ),
  );

  const droppedEarlierCall = await runScenario('openai-compatible', [
    {
      index: 1,
      id: 'call_done',
      type: 'function',
      function: { name: 'write_file', arguments: '{"path":"done"}' },
    },
    {
      index: 0,
      type: 'function',
      function: { name: 'read_file', arguments: '{"path":"fatal"}' },
    },
  ]);

  const b1 = await Promise.all(
    providers.map(provider =>
      runScenario(provider, [
        {
          index: 0,
          id: 'dup',
          type: 'function',
          function: { name: 'read_file', arguments: '{"path":"a"}' },
        },
        {
          index: 1,
          id: 'dup',
          type: 'function',
          function: { name: 'write_file', arguments: '{"path":"b"}' },
        },
      ]),
    ),
  );

  const b2 = await Promise.all(
    providers.map(provider =>
      runScenario(provider, [
        {
          index: 0,
          id: 'call_a',
          type: 'function',
          function: { name: '', arguments: '{"path":"a"}' },
        },
      ]),
    ),
  );

  const b3 = await Promise.all(
    providers.map(provider =>
      runScenario(provider, [
        {
          index: 0,
          id: '',
          type: 'function',
          function: { name: 'read_file', arguments: '{"path":"a"}' },
        },
      ]),
    ),
  );

  const b4 = await runScenario('openai-compatible', [
    {
      index: 0,
      id: 'call_a',
      type: 'function',
      function: { name: 'read_file', arguments: '{"path":"a"}' },
    },
    {
      index: 1,
      id: 'call_b',
      type: 'function',
      function: { name: 'write_file', arguments: '{"path":"b"}' },
    },
    {
      function: { arguments: '{"unattributed":true}' },
    },
  ]);

  const outOfOrder = await runScenario('openai-compatible', [
    {
      index: 1,
      id: 'call_1',
      type: 'function',
      function: { name: 'second_by_index', arguments: '{}' },
    },
    {
      index: 0,
      id: 'call_0',
      type: 'function',
      function: { name: 'first_by_index', arguments: '{}' },
    },
  ]);

  const expectedA1 = [
    { name: 'read_file', input: '{"path":"p0"}' },
    { name: 'write_file', input: '{"path":"p1"}' },
    { name: 'read_file', input: '{"path":"p2"}' },
  ];
  const expectedA2 = [{ name: 'read_file', input: '{"path":"a"}' }];
  const expectedB1 = [
    { name: 'read_file', input: '{"path":"a"}' },
    { name: 'write_file', input: '{"path":"b"}' },
  ];
  const expectedB4 = expectedB1;

  const observations = {
    A1: a1.map((result, index) => ({
      provider: providers[index],
      error: result.error,
      toolCalls: toolCalls(result),
    })),
    A2: a2.map((result, index) => ({
      provider: providers[index],
      error: result.error,
      toolCalls: toolCalls(result),
    })),
    droppedEarlierCall: {
      error: droppedEarlierCall.error,
      toolCalls: toolCalls(droppedEarlierCall),
    },
    B1: b1.map((result, index) => ({
      provider: providers[index],
      error: result.error,
      toolCalls: toolCalls(result),
    })),
    B2: b2.map((result, index) => ({
      provider: providers[index],
      error: result.error,
      toolCalls: toolCalls(result),
    })),
    B3: b3.map((result, index) => ({
      provider: providers[index],
      error: result.error,
      toolCalls: toolCalls(result),
    })),
    B4: {
      error: b4.error,
      toolCalls: toolCalls(b4),
    },
    outOfOrder: {
      error: outOfOrder.error,
      toolCalls: toolCalls(outOfOrder),
    },
  };

  console.log(JSON.stringify(observations, null, 2));

  const primaryFailures = [
    ...a1.flatMap((result, index) =>
      callsMatch(result, expectedA1) ? [] : [`A1/${providers[index]}`],
    ),
    ...(callsMatch(droppedEarlierCall, [
      { name: 'read_file', input: '{"path":"fatal"}' },
      { name: 'write_file', input: '{"path":"done"}' },
    ])
      ? []
      : ['A1/drops-earlier-call']),
  ];

  const secondaryFailures = [
    ...a2.flatMap((result, index) =>
      callsMatch(result, expectedA2) ? [] : [`A2/${providers[index]}`],
    ),
    ...b1.flatMap((result, index) =>
      callsMatch(result, expectedB1) ? [] : [`B1/${providers[index]}`],
    ),
    ...b2.flatMap((result, index) => {
      const calls = toolCalls(result);
      return result.error == null && calls.some(call => call.toolName === '')
        ? [`B2/${providers[index]}`]
        : [];
    }),
    ...b3.flatMap((result, index) =>
      hasUsableUniqueIds(toolCalls(result)) ? [] : [`B3/${providers[index]}`],
    ),
    ...(callsMatch(b4, expectedB4) ? [] : ['B4/openai-compatible']),
    ...(toolCalls(outOfOrder)
      .map(call => call.toolName)
      .join(',') === 'first_by_index,second_by_index'
      ? []
      : ['minor/out-of-order']),
  ];

  if (primaryFailures.length > 0) {
    console.error(
      `ISSUE 18440 REPRODUCED: omitted streamed tool-call IDs abort the turn and drop calls (${primaryFailures.join(', ')}).`,
    );
    process.exitCode = 1;
    return;
  }

  if (secondaryFailures.length > 0) {
    console.error(
      `ISSUE 18440 SECONDARY FAILURES: ${secondaryFailures.join(', ')}.`,
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    'ISSUE 18440 NOT REPRODUCED: all streamed tool calls were preserved.',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
