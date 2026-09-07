import { createOpenAI } from '@ai-sdk/openai';

const applyPatchCall = {
  type: 'apply_patch_call' as const,
  id: 'apc_1',
  call_id: 'call_1',
  status: 'completed' as const,
  operation: {
    type: 'update_file' as const,
    path: 'a.txt',
    diff: '@@\n-old\n+new\n',
  },
};

const usage = {
  input_tokens: 1,
  input_tokens_details: { cached_tokens: 0 },
  output_tokens: 1,
  output_tokens_details: { reasoning_tokens: 0 },
  total_tokens: 2,
};

const completedResponse = {
  id: 'resp_1',
  created_at: 0,
  model: 'gpt-5.1',
  output: [applyPatchCall],
  usage,
  incomplete_details: null,
  service_tier: null,
};

const streamBody = [
  {
    type: 'response.created',
    response: {
      id: 'resp_1',
      created_at: 0,
      model: 'gpt-5.1',
      service_tier: null,
    },
  },
  {
    type: 'response.output_item.added',
    output_index: 0,
    item: { ...applyPatchCall, status: 'in_progress' },
  },
  {
    type: 'response.output_item.done',
    output_index: 0,
    item: applyPatchCall,
  },
  {
    type: 'response.completed',
    response: completedResponse,
  },
]
  .map(event => `data: ${JSON.stringify(event)}\n\n`)
  .join('');

async function main() {
  const fetch: typeof globalThis.fetch = async (_url, init) => {
    const request = JSON.parse(String(init?.body)) as { stream?: boolean };

    return new Response(
      request.stream ? streamBody : JSON.stringify(completedResponse),
      {
        headers: {
          'content-type': request.stream
            ? 'text/event-stream'
            : 'application/json',
        },
      },
    );
  };

  const model = createOpenAI({ apiKey: 'test', fetch }).responses('gpt-5.1');
  const prompt = [
    {
      role: 'user' as const,
      content: [{ type: 'text' as const, text: 'edit a.txt' }],
    },
  ];
  const tools = [
    {
      type: 'provider' as const,
      id: 'openai.apply_patch' as const,
      name: 'apply_patch',
      args: {},
    },
  ];

  const generated = await model.doGenerate({ prompt, tools });
  if (!generated.content.some(part => part.type === 'tool-call')) {
    throw new Error(
      'Reproduction setup failed: doGenerate emitted no tool call',
    );
  }

  const streamed = await model.doStream({ prompt, tools });
  let streamedToolCall = false;
  let streamedFinishReason: string | undefined;

  const reader = streamed.stream.getReader();
  while (true) {
    const { done, value: part } = await reader.read();
    if (done) {
      break;
    }

    if (part.type === 'tool-call') {
      streamedToolCall = true;
    } else if (part.type === 'finish') {
      streamedFinishReason = part.finishReason.unified;
    }
  }

  if (!streamedToolCall || streamedFinishReason == null) {
    throw new Error(
      'Reproduction setup failed: doStream did not emit a tool call and finish',
    );
  }

  const expected = 'tool-calls';
  const mismatches = [
    generated.finishReason.unified === expected
      ? undefined
      : `doGenerate=${generated.finishReason.unified}`,
    streamedFinishReason === expected
      ? undefined
      : `doStream=${streamedFinishReason}`,
  ].filter((value): value is string => value != null);

  if (mismatches.length > 0) {
    throw new Error(
      `ISSUE_20427: apply_patch finish reason mismatch: ${mismatches.join(', ')}; expected tool-calls`,
    );
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
