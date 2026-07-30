import { randomUUID } from 'node:crypto';

import { createAnthropic } from '@ai-sdk/anthropic';
import { streamText, stepCountIs } from 'ai';

type Usage = {
  uncachedInput: number;
  cacheRead: number;
  cacheWrite: number;
};

type CapturedRequest = {
  input: RequestInfo | URL;
  init: RequestInit | undefined;
  body: Record<string, unknown>;
};

const capturedRequests: CapturedRequest[] = [];
const capturedResponses: string[] = [];

async function captureFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  if (typeof init?.body !== 'string') {
    throw new Error('Expected the Anthropic request body to be a string.');
  }

  capturedRequests.push({
    input,
    init,
    body: JSON.parse(init.body),
  });

  const response = await fetch(input, init);
  const responseBody = await response.text();
  capturedResponses.push(responseBody);

  return new Response(responseBody, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

function sseEvents(body: string): Array<Record<string, any>> {
  return body
    .split('\n')
    .filter(line => line.startsWith('data: '))
    .map(line => JSON.parse(line.slice(6)));
}

function usage(body: string): Usage {
  const events = sseEvents(body);
  const start =
    events.find(event => event.type === 'message_start')?.message?.usage ?? {};
  const deltas = events.filter(
    event => event.type === 'message_delta' && event.usage != null,
  );
  const last = deltas.at(-1)?.usage ?? {};

  return {
    uncachedInput: last.input_tokens ?? start.input_tokens ?? 0,
    cacheRead:
      last.cache_read_input_tokens ?? start.cache_read_input_tokens ?? 0,
    cacheWrite:
      last.cache_creation_input_tokens ??
      start.cache_creation_input_tokens ??
      0,
  };
}

function reconstructAssistantBlocks(body: string): Array<Record<string, any>> {
  const blocks: Array<Record<string, any>> = [];
  const rawInputs: Record<number, string> = {};

  for (const event of sseEvents(body)) {
    if (event.type === 'content_block_start') {
      blocks[event.index] = structuredClone(event.content_block);
      rawInputs[event.index] = '';
      continue;
    }

    if (event.type !== 'content_block_delta') {
      continue;
    }

    const block = blocks[event.index];
    const delta = event.delta;

    if (delta.type === 'text_delta') {
      block.text += delta.text;
    } else if (delta.type === 'thinking_delta') {
      block.thinking += delta.thinking;
    } else if (delta.type === 'signature_delta') {
      block.signature = (block.signature ?? '') + delta.signature;
    } else if (delta.type === 'input_json_delta') {
      rawInputs[event.index] += delta.partial_json;
    }
  }

  for (const [index, rawInput] of Object.entries(rawInputs)) {
    if (rawInput.length > 0) {
      blocks[Number(index)].input = JSON.parse(rawInput);
    }
  }

  return blocks;
}

async function sendDirectReplay(
  capturedSdkReplay: CapturedRequest,
  exactBody: Record<string, unknown>,
): Promise<string> {
  const response = await fetch(capturedSdkReplay.input, {
    ...capturedSdkReplay.init,
    body: JSON.stringify(exactBody),
  });
  const responseBody = await response.text();

  if (!response.ok) {
    throw new Error(
      `Direct Anthropic replay failed with HTTP ${response.status}: ${responseBody}`,
    );
  }

  return responseBody;
}

function printUsage(label: string, value: Usage): void {
  console.log(
    `${label}: uncached_input=${value.uncachedInput} cache_read=${value.cacheRead} cache_write=${value.cacheWrite}`,
  );
}

async function main() {
  const modelId = process.env.MODEL ?? 'claude-sonnet-5';
  const anthropic = createAnthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    fetch: captureFetch,
  });
  const runId = randomUUID();
  const userPrompt =
    "Using bash code execution, print the squares of 1..12 (one per line as 'n: n^2'). " +
    `Then in a SECOND separate execution, print the sum of those squares. Finally state the sum in one sentence. Reproduction run: ${runId}.`;
  const common = {
    model: anthropic(modelId),
    system:
      'You are a precise computational assistant working in a bash sandbox. Always use the code execution tool for any computation.',
    tools: {
      code_execution: anthropic.tools.codeExecution_20260120(),
    },
    stopWhen: stepCountIs(8),
    maxRetries: 0,
    providerOptions: {
      anthropic: {
        effort: 'low',
        cacheControl: { type: 'ephemeral' },
      },
    },
  } as const;

  console.log(`model: ${modelId}`);

  const firstTurn = streamText({
    ...common,
    maxOutputTokens: 8000,
    messages: [{ role: 'user', content: userPrompt }],
  });
  await firstTurn.consumeStream();
  const firstTurnMessages = (await firstTurn.response).messages;
  const liveUsage = usage(capturedResponses[0]);

  const replayMessages = [
    { role: 'user' as const, content: userPrompt },
    ...firstTurnMessages,
    {
      role: 'user' as const,
      content:
        'From the transcript above, what was the square of 9? Answer without running code.',
    },
  ];

  const sdkReplay = streamText({
    ...common,
    maxOutputTokens: 500,
    messages: replayMessages,
  });
  await sdkReplay.consumeStream();
  const sdkReplayUsage = usage(capturedResponses[1]);
  const capturedSdkReplay = capturedRequests[1];

  const wireBlocks = reconstructAssistantBlocks(capturedResponses[0]);
  const exactBody = structuredClone(capturedSdkReplay.body) as {
    messages: Array<{ role: string; content: unknown }>;
  };
  const assistantMessage = exactBody.messages.find(
    message => message.role === 'assistant',
  );
  if (assistantMessage == null) {
    throw new Error('Expected an assistant message in the replay request.');
  }
  assistantMessage.content = wireBlocks;

  const directReplayBody = await sendDirectReplay(capturedSdkReplay, exactBody);
  const directReplayUsage = usage(directReplayBody);
  const directRepeatBody = await sendDirectReplay(capturedSdkReplay, exactBody);
  const directRepeatUsage = usage(directRepeatBody);

  const sdkAssistant = (
    capturedSdkReplay.body.messages as Array<{
      role: string;
      content: Array<Record<string, any>>;
    }>
  ).find(message => message.role === 'assistant');
  const sdkServerToolUse = sdkAssistant?.content.find(
    block => block.type === 'server_tool_use',
  );
  const wireServerToolUse = wireBlocks.find(
    block => block.type === 'server_tool_use',
  );

  printUsage('turn 1 (live code-exec turn)', liveUsage);
  printUsage('turn 2 (AI SDK replay)', sdkReplayUsage);
  printUsage('turn 2b (byte-exact direct replay)', directReplayUsage);
  printUsage('turn 2c (identical direct replay)', directRepeatUsage);
  console.log(
    `wire server_tool_use.input: ${JSON.stringify(wireServerToolUse?.input)}`,
  );
  console.log(
    `SDK server_tool_use.input: ${JSON.stringify(sdkServerToolUse?.input)}`,
  );

  const sdkLostCachedTranscript =
    directReplayUsage.cacheRead - sdkReplayUsage.cacheRead > 50;
  const exactReplayMatchedLiveCache =
    directReplayUsage.cacheRead >= liveUsage.cacheWrite - 20;
  const exactReplayThenHit =
    directRepeatUsage.cacheRead > directReplayUsage.cacheRead;
  const sdkAddedSyntheticType =
    wireServerToolUse?.input?.type == null &&
    sdkServerToolUse?.input?.type === wireServerToolUse?.name;

  console.log(
    `sdk_lost_cached_transcript=${sdkLostCachedTranscript} exact_replay_matched_live_cache=${exactReplayMatchedLiveCache} exact_replay_then_hit=${exactReplayThenHit} sdk_added_synthetic_type=${sdkAddedSyntheticType}`,
  );

  if (
    sdkLostCachedTranscript &&
    exactReplayMatchedLiveCache &&
    sdkAddedSyntheticType
  ) {
    throw new Error(
      'ISSUE #18193 REPRODUCED: AI SDK replay lost cached code-execution transcript tokens',
    );
  }

  console.log(
    'ISSUE #18193 NOT REPRODUCED: AI SDK replay matched the byte-exact replay cache usage',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
