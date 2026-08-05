import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type {
  LanguageModelV4,
  LanguageModelV4StreamPart,
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

type ScenarioResult = {
  error?: string;
  parts: LanguageModelV4StreamPart[];
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
): LanguageModelV4 {
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
  const parts: LanguageModelV4StreamPart[] = [];

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

    return { parts };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      parts,
    };
  }
}

function toolCalls(result: ScenarioResult) {
  return result.parts.filter(part => part.type === 'tool-call');
}

function hasError(result: ScenarioResult, message: string) {
  return result.error?.includes(message) === true;
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

  const b1Matches = b1.every(result => {
    const calls = toolCalls(result);
    return (
      result.error == null &&
      calls.length === 1 &&
      calls[0].toolCallId === 'dup' &&
      calls[0].toolName === 'read_file' &&
      calls[0].input === '{"path":"a"}{"path":"b"}'
    );
  });

  const b2Matches = b2.every(result => {
    const calls = toolCalls(result);
    return (
      result.error == null && calls.length === 1 && calls[0].toolName === ''
    );
  });

  const b3Matches = b3.every(result => {
    const calls = toolCalls(result);
    return (
      result.error == null && calls.length === 1 && calls[0].toolCallId === ''
    );
  });

  const b4Calls = toolCalls(b4);
  const b4Matches =
    b4.error == null &&
    b4Calls.length === 2 &&
    b4Calls[1].toolCallId === 'call_b' &&
    b4Calls[1].input === '{"path":"b"}{"unattributed":true}';

  const orderedNames = toolCalls(outOfOrder).map(call => call.toolName);
  const observations = {
    A1: a1.map((result, index) => ({
      provider: providers[index],
      error: result.error,
      emittedToolCalls: toolCalls(result).length,
    })),
    A2: a2.map((result, index) => ({
      provider: providers[index],
      error: result.error,
      emittedToolCalls: toolCalls(result).length,
    })),
    droppedEarlierCall: {
      error: droppedEarlierCall.error,
      emittedToolCalls: toolCalls(droppedEarlierCall).length,
    },
    B1: b1.map((result, index) => ({
      provider: providers[index],
      toolCalls: toolCalls(result),
    })),
    B2: b2.map((result, index) => ({
      provider: providers[index],
      toolCalls: toolCalls(result),
    })),
    B3: b3.map((result, index) => ({
      provider: providers[index],
      toolCalls: toolCalls(result),
    })),
    B4: b4Calls,
    outOfOrderNames: orderedNames,
  };

  console.log(JSON.stringify(observations, null, 2));

  const primaryReproduced =
    a1.every(result => hasError(result, "Expected 'id' to be a string.")) &&
    a2.every(result =>
      hasError(result, "Expected 'function.name' to be a string."),
    ) &&
    hasError(droppedEarlierCall, "Expected 'id' to be a string.") &&
    toolCalls(droppedEarlierCall).length === 0;

  const secondaryBehaviorsReproduced =
    b1Matches &&
    b2Matches &&
    b3Matches &&
    b4Matches &&
    orderedNames.join(',') === 'second_by_index,first_by_index';

  if (primaryReproduced) {
    console.error(
      secondaryBehaviorsReproduced
        ? 'ISSUE 18440 REPRODUCED: omitted or blank tool-call IDs abort the turn; B1-B4 and out-of-order emission also match the report.'
        : 'ISSUE 18440 REPRODUCED: omitted or blank tool-call IDs abort the turn.',
    );
    process.exitCode = 1;
    return;
  }

  console.log('ISSUE 18440 NOT REPRODUCED: streamed turns completed.');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
