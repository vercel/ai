import { createOpenAI } from '@ai-sdk/openai';
import { generateText, streamText } from 'ai';

const expectedFinishReason = 'tool-calls';
const prompt = 'Update a.txt by replacing old with new.';

const item = {
  type: 'apply_patch_call',
  id: 'apc_1',
  call_id: 'call_1',
  status: 'completed',
  operation: {
    type: 'update_file',
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

function createFakeFetch(): typeof globalThis.fetch {
  const generateBody = JSON.stringify({
    id: 'resp_1',
    created_at: 0,
    model: 'gpt-5.1',
    output: [item],
    usage,
    incomplete_details: null,
    service_tier: null,
  });
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
      item: { ...item, status: 'in_progress' },
    },
    {
      type: 'response.output_item.done',
      output_index: 0,
      item,
    },
    {
      type: 'response.completed',
      response: {
        usage,
        incomplete_details: null,
        reasoning: null,
        service_tier: null,
      },
    },
  ]
    .map(event => `data: ${JSON.stringify(event)}\n\n`)
    .join('');

  return async (_url, init) => {
    const request = JSON.parse(String(init?.body));
    const stream = request.stream === true;

    return new Response(stream ? streamBody : generateBody, {
      headers: {
        'content-type': stream ? 'text/event-stream' : 'application/json',
      },
    });
  };
}

function createRecordingFetch() {
  const exchanges: Array<
    Promise<{ request: unknown; status: number; response: string }>
  > = [];

  const fetch: typeof globalThis.fetch = async (url, init) => {
    const request = JSON.parse(String(init?.body));
    const response = await globalThis.fetch(url, init);
    const responseClone = response.clone();

    exchanges.push(
      responseClone.text().then(body => ({
        request,
        status: response.status,
        response: body,
      })),
    );

    return response;
  };

  return { fetch, exchanges };
}

async function runModel({
  fetch,
  modelId,
}: {
  fetch: typeof globalThis.fetch;
  modelId: string;
}) {
  const openai = createOpenAI({ fetch });
  const model = openai.responses(modelId);
  const generated = await generateText({
    model,
    prompt,
    tools: { apply_patch: openai.tools.applyPatch({}) },
    toolChoice: { type: 'tool', toolName: 'apply_patch' },
  });
  const streamed = streamText({
    model,
    prompt,
    tools: { apply_patch: openai.tools.applyPatch({}) },
    toolChoice: { type: 'tool', toolName: 'apply_patch' },
  });

  let streamedToolCall = false;
  for await (const part of streamed.fullStream) {
    if (part.type === 'tool-call' && part.toolName === 'apply_patch') {
      streamedToolCall = true;
    }
  }

  const generatedToolCall = generated.steps[0]?.toolCalls.some(
    toolCall => toolCall.toolName === 'apply_patch',
  );
  const streamedFinishReason = (await streamed.steps)[0]?.finishReason;

  if (!generatedToolCall || !streamedToolCall) {
    throw new Error(
      'Reproduction setup failed: apply_patch tool call was not emitted in both paths.',
    );
  }
  if (streamedFinishReason == null) {
    throw new Error(
      'Reproduction setup failed: doStream emitted no finish part.',
    );
  }

  const finishReasons = {
    generateText: generated.steps[0]?.finishReason,
    streamText: streamedFinishReason,
  };
  console.log(JSON.stringify(finishReasons));

  if (
    finishReasons.generateText !== expectedFinishReason ||
    finishReasons.streamText !== expectedFinishReason
  ) {
    throw new Error(
      'ISSUE_20427_REPRODUCED: apply_patch steps finished with "stop" instead of "tool-calls" in generateText and streamText',
    );
  }
}

async function main() {
  if (process.argv.includes('--live')) {
    const { fetch, exchanges } = createRecordingFetch();
    let observedError: unknown;
    try {
      await runModel({ fetch, modelId: 'gpt-5.6' });
    } catch (error) {
      observedError = error;
    }
    console.log(JSON.stringify(await Promise.all(exchanges), null, 2));
    if (observedError != null) {
      throw observedError;
    }
    return;
  }

  await runModel({ fetch: createFakeFetch(), modelId: 'gpt-5.1' });
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
