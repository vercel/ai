import { createOpenAICompatible } from '../../../../packages/openai-compatible/src';
import { createOpenAI } from '../../../../packages/openai/src';

type ProviderKind = 'openai-compatible' | 'openai';

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
  streamErrors: string[];
  toolCalls: Array<{
    toolCallId: string;
    toolName: string;
    input: string;
  }>;
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

function createModel(providerKind: ProviderKind, deltas: ToolCallDelta[]) {
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
  const toolCalls: ScenarioResult['toolCalls'] = [];
  const streamErrors: string[] = [];

  try {
    const { stream } = await createModel(providerKind, deltas).doStream({
      prompt,
    });

    for await (const part of stream) {
      if (part.type === 'tool-call') {
        toolCalls.push({
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          input: part.input,
        });
      } else if (part.type === 'error') {
        streamErrors.push(
          part.error instanceof Error ? part.error.message : String(part.error),
        );
      }
    }

    return { streamErrors, toolCalls };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      streamErrors,
      toolCalls,
    };
  }
}

async function forBothProviders(deltas: ToolCallDelta[]) {
  return Promise.all(
    (['openai-compatible', 'openai'] as const).map(async provider => ({
      provider,
      result: await runScenario(provider, deltas),
    })),
  );
}

async function main() {
  const omittedId = await forBothProviders([
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
  ]);

  const blankContinuationId = await forBothProviders([
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
  ]);

  const completeCallBeforeFailure = await runScenario('openai-compatible', [
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

  const repeatedId = await forBothProviders([
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
  ]);

  const blankName = await forBothProviders([
    {
      index: 0,
      id: 'call_a',
      type: 'function',
      function: { name: '', arguments: '{"path":"a"}' },
    },
  ]);

  const blankId = await forBothProviders([
    {
      index: 0,
      id: '',
      type: 'function',
      function: { name: 'read_file', arguments: '{"path":"a"}' },
    },
  ]);

  const unattributableDelta = await runScenario('openai-compatible', [
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

  console.log(
    JSON.stringify(
      {
        omittedId,
        blankContinuationId,
        completeCallBeforeFailure,
        repeatedId,
        blankName,
        blankId,
        unattributableDelta,
        outOfOrder,
      },
      null,
      2,
    ),
  );

  const expectedNames = ['read_file', 'write_file', 'read_file'];
  const expectedInputs = ['{"path":"p0"}', '{"path":"p1"}', '{"path":"p2"}'];
  const omittedIdWorks = omittedId.every(({ result }) => {
    const ids = result.toolCalls.map(call => call.toolCallId);
    return (
      result.error == null &&
      result.toolCalls.length === 3 &&
      result.toolCalls.every(
        (call, index) =>
          call.toolName === expectedNames[index] &&
          call.input === expectedInputs[index],
      ) &&
      ids.every(id => id.trim().length > 0) &&
      new Set(ids).size === ids.length
    );
  });

  if (!omittedIdWorks) {
    console.error(
      'ISSUE 18440 REPRODUCED: omitted tool-call IDs abort the streamed turn before three calls can be emitted.',
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    'ISSUE 18440 NOT REPRODUCED: omitted-ID calls were emitted separately with usable unique IDs.',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
