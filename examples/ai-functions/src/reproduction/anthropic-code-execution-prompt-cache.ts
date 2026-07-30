import { createAnthropic } from '@ai-sdk/anthropic';
import { stepCountIs, streamText } from 'ai';
import { writeFileSync } from 'node:fs';

type Usage = {
  uncachedInput: number;
  cacheRead: number;
  cacheWrite: number;
};

type SseEvent = {
  type: string;
  index?: number;
  content_block?: Record<string, unknown>;
  delta?: Record<string, unknown>;
  message?: { usage?: Record<string, number> };
  usage?: Record<string, number>;
};

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is required');
  }

  const modelId = process.env.MODEL ?? 'claude-sonnet-5';
  const cacheTtl = process.env.CACHE_TTL === '1h' ? '1h' : '5m';
  const runId = `${Date.now()}-${Math.random()}`;
  const exchanges: Array<{ request?: string; response?: string }> = [];

  const captureFetch: typeof fetch = async (input, init) => {
    const exchange = {
      request: typeof init?.body === 'string' ? init.body : undefined,
      response: undefined as string | undefined,
    };
    exchanges.push(exchange);

    const response = await fetch(input, init);
    if (!response.body) {
      return response;
    }

    const [sdkBody, captureBody] = response.body.tee();
    void new Response(captureBody).text().then(text => {
      exchange.response = text;
    });

    return new Response(sdkBody, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  };

  const provider = createAnthropic({ apiKey, fetch: captureFetch });
  const tools = {
    code_execution: provider.tools.codeExecution_20260120(),
  };
  const system =
    'You are a precise computational assistant working in a bash sandbox. Always use the code execution tool for any computation. ' +
    `Cache reproduction run id: ${runId}.`;
  const firstUserMessage =
    "Using bash code execution, print the squares of 1..12 (one per line as 'n: n^2'). " +
    'Then in a SECOND separate execution, print the sum of those squares. Finally state the sum in one sentence.';
  const common = {
    model: provider(modelId),
    system,
    tools,
    stopWhen: stepCountIs(8),
    maxRetries: 0,
    providerOptions: {
      anthropic: {
        effort: 'low' as const,
        cacheControl: { type: 'ephemeral' as const, ttl: cacheTtl },
      },
    },
  };

  console.log(`model: ${modelId}; cache_ttl: ${cacheTtl}`);

  const turn1 = streamText({
    ...common,
    maxOutputTokens: 8000,
    messages: [{ role: 'user', content: firstUserMessage }],
  });
  await turn1.consumeStream();
  const turn1Messages = (await turn1.response).messages;
  await waitForCapture(exchanges, 0);
  const turn1Usage = readUsage(exchanges[0].response);
  printUsage('turn 1 (live code-exec turn)', turn1Usage);
  if (process.env.RECORD_FIXTURE === '1') {
    writeFileSync(
      '../../packages/anthropic/src/__fixtures__/anthropic-code-execution-20260120-cache-replay.chunks.txt',
      `${readSseEvents(exchanges[0].response)
        .map(event => JSON.stringify(event))
        .join('\n')}\n`,
    );
  }

  const followUp = {
    role: 'user' as const,
    content:
      'From the transcript above, what was the square of 9? Answer without running code.',
  };
  const replayedMessages = [
    { role: 'user' as const, content: firstUserMessage },
    ...turn1Messages,
    followUp,
  ];

  const turn2 = streamText({
    ...common,
    maxOutputTokens: 500,
    messages: replayedMessages,
  });
  await turn2.consumeStream();
  await waitForCapture(exchanges, 1);
  const turn2Usage = readUsage(exchanges[1].response);
  printUsage('turn 2 (replayed history, first time)', turn2Usage);

  const turn3 = streamText({
    ...common,
    maxOutputTokens: 500,
    messages: replayedMessages,
  });
  await turn3.consumeStream();
  await waitForCapture(exchanges, 2);
  const turn3Usage = readUsage(exchanges[2].response);
  printUsage('turn 3 (identical replay)', turn3Usage);

  const liveCachedContext =
    turn1Usage.uncachedInput + turn1Usage.cacheRead + turn1Usage.cacheWrite;
  const liveToReplayMatched = turn2Usage.cacheRead >= liveCachedContext * 0.8;
  const replayToReplayMatched = turn3Usage.cacheRead > turn2Usage.cacheRead;
  const differences = compareWireWithReplay(
    exchanges[0].response,
    exchanges[1].request,
  );

  console.log(`live cached context: ${liveCachedContext}`);
  console.log(`live to replay cache matched: ${liveToReplayMatched}`);
  console.log(`replay to replay cache matched: ${replayToReplayMatched}`);
  for (const difference of differences) {
    console.log(difference);
  }

  if (!liveToReplayMatched) {
    throw new Error(
      `ISSUE #18193 REPRODUCED: live code-execution transcript did not reuse its cache (turn1_context=${liveCachedContext}, turn2_cache_read=${turn2Usage.cacheRead}, replay_to_replay=${replayToReplayMatched})`,
    );
  }
}

async function waitForCapture(
  exchanges: Array<{ response?: string }>,
  index: number,
) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (exchanges[index]?.response != null) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out capturing Anthropic response ${index + 1}`);
}

function readUsage(response: string | undefined): Usage {
  const events = readSseEvents(response);
  const startUsage = events.find(event => event.type === 'message_start')
    ?.message?.usage;
  const finalUsage = events
    .filter(event => event.type === 'message_delta' && event.usage != null)
    .at(-1)?.usage;

  return {
    uncachedInput: finalUsage?.input_tokens ?? startUsage?.input_tokens ?? 0,
    cacheRead:
      finalUsage?.cache_read_input_tokens ??
      startUsage?.cache_read_input_tokens ??
      0,
    cacheWrite:
      finalUsage?.cache_creation_input_tokens ??
      startUsage?.cache_creation_input_tokens ??
      0,
  };
}

function readSseEvents(response: string | undefined): SseEvent[] {
  if (response == null) {
    throw new Error('Missing captured Anthropic response');
  }

  return response
    .split('\n')
    .filter(line => line.startsWith('data: '))
    .map(line => JSON.parse(line.slice(6)) as SseEvent);
}

function printUsage(label: string, usage: Usage) {
  console.log(
    `${label}: uncached_input=${usage.uncachedInput} cache_read=${usage.cacheRead} cache_write=${usage.cacheWrite}`,
  );
}

function compareWireWithReplay(
  liveResponse: string | undefined,
  replayRequest: string | undefined,
) {
  if (replayRequest == null) {
    throw new Error('Missing captured replay request');
  }

  const blocks: Array<Record<string, unknown>> = [];
  const rawInputs: Record<number, string> = {};

  for (const event of readSseEvents(liveResponse)) {
    if (
      event.type === 'content_block_start' &&
      event.index != null &&
      event.content_block != null
    ) {
      blocks[event.index] = structuredClone(event.content_block);
      rawInputs[event.index] = '';
    } else if (
      event.type === 'content_block_delta' &&
      event.index != null &&
      event.delta != null
    ) {
      const block = blocks[event.index];
      const delta = event.delta;
      if (delta.type === 'text_delta' && typeof delta.text === 'string') {
        block.text = `${block.text ?? ''}${delta.text}`;
      } else if (
        delta.type === 'input_json_delta' &&
        typeof delta.partial_json === 'string'
      ) {
        rawInputs[event.index] += delta.partial_json;
      }
    }
  }

  for (const [index, rawInput] of Object.entries(rawInputs)) {
    if (rawInput.length > 0) {
      blocks[Number(index)].input = JSON.parse(rawInput);
    }
  }

  const request = JSON.parse(replayRequest) as {
    messages: Array<{ content: Array<Record<string, unknown>> }>;
  };
  const replayedBlocks = request.messages[1].content;
  const differences: string[] = [];

  for (
    let index = 0;
    index < Math.max(blocks.length, replayedBlocks.length);
    index++
  ) {
    const wire = JSON.stringify(blocks[index]);
    const replay = JSON.stringify(replayedBlocks[index]);
    if (wire !== replay) {
      differences.push(
        `block ${index} (${String(blocks[index]?.type)}): wire=${wire} replay=${replay}`,
      );
    }
  }

  return differences;
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
