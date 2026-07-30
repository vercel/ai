import { writeFileSync } from 'node:fs';

import { createAnthropic } from '../../../../packages/anthropic/dist/index.mjs';
import {
  stepCountIs,
  streamText,
} from '../../../../packages/ai/dist/index.mjs';

type JsonObject = Record<string, any>;

const model = process.env.MODEL ?? 'claude-sonnet-5';
const apiKey = process.env.ANTHROPIC_API_KEY;

const system =
  'You are a precise computational assistant working in a bash sandbox. ' +
  'Always use the code execution tool for any computation. ' +
  `This reproduction run is ${crypto.randomUUID()}.`;
const firstUserMessage =
  "Using bash code execution, print the squares of 1..12 (one per line as 'n: n^2'). " +
  'Then in a SECOND separate execution, print the sum of those squares. ' +
  'Finally state the sum in one sentence.';
const followUp =
  'From the transcript above, what was the square of 9? Answer without running code.';

function parseSse(text: string): JsonObject[] {
  return text
    .split('\n')
    .filter(line => line.startsWith('data: '))
    .map(line => JSON.parse(line.slice(6)));
}

function usage(events: JsonObject[]) {
  const start =
    events.find(event => event.type === 'message_start')?.message?.usage ?? {};
  const deltas = events.filter(
    event => event.type === 'message_delta' && event.usage,
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

function wireAssistantBlocks(events: JsonObject[]) {
  const blocks: JsonObject[] = [];
  const rawInputs: Record<number, string> = {};

  for (const event of events) {
    if (event.type === 'content_block_start') {
      blocks[event.index] = structuredClone(event.content_block);
      rawInputs[event.index] = '';
    } else if (event.type === 'content_block_delta') {
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
  }

  for (const [index, input] of Object.entries(rawInputs)) {
    if (input.length > 0) {
      blocks[Number(index)].input = JSON.parse(input);
    }
  }

  return blocks;
}

async function directAnthropicRequest(body: JsonObject) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });
  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(
      `Direct Anthropic request failed (${response.status}): ${responseText}`,
    );
  }

  return parseSse(responseText);
}

function printUsage(label: string, value: ReturnType<typeof usage>) {
  console.log(
    `${label}: uncached_input=${value.uncachedInput} ` +
      `cache_read=${value.cacheRead} cache_write=${value.cacheWrite}`,
  );
}

async function main() {
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is required');
  }

  const sdkRequests: JsonObject[] = [];
  const sdkResponses: JsonObject[][] = [];
  const sdkResponseTexts: string[] = [];
  const captureFetch: typeof fetch = async (input, init) => {
    sdkRequests.push(JSON.parse(String(init?.body)));
    const response = await fetch(input, init);
    const responseText = await response.text();

    if (!response.ok) {
      throw new Error(
        `AI SDK Anthropic request failed (${response.status}): ${responseText}`,
      );
    }

    sdkResponses.push(parseSse(responseText));
    sdkResponseTexts.push(responseText);
    return new Response(responseText, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  };

  const anthropic = createAnthropic({ apiKey, fetch: captureFetch });
  const common = {
    model: anthropic(model),
    system,
    tools: {
      code_execution: anthropic.tools.codeExecution_20260120(),
    },
    stopWhen: stepCountIs(8),
    maxRetries: 0,
    providerOptions: {
      anthropic: {
        cacheControl: { type: 'ephemeral' as const },
      },
    },
  };

  console.log(`model: ${model}`);

  const turn1 = streamText({
    ...common,
    maxOutputTokens: 8000,
    messages: [{ role: 'user', content: firstUserMessage }],
  });
  await turn1.consumeStream();
  const responseMessages = (await turn1.response).messages;
  const liveEvents = sdkResponses[0];
  const liveUsage = usage(liveEvents);
  const wireBlocks = wireAssistantBlocks(liveEvents);

  if (process.env.RECORD_ISSUE_18193_FIXTURE === '1') {
    const fixture = sdkResponseTexts[0]
      .split('\n')
      .filter(line => line.startsWith('data: '))
      .map(line => line.slice(6))
      .join('\n');
    writeFileSync(
      new URL(
        '../../../../packages/anthropic/src/__fixtures__/anthropic-code-execution-20260120-issue-18193.chunks.txt',
        import.meta.url,
      ),
      `${fixture}\n`,
    );
  }

  if (!wireBlocks.some(block => block.type === 'server_tool_use')) {
    throw new Error(
      'Anthropic did not emit a server_tool_use block, so the reported scenario was not exercised',
    );
  }

  const directReplayBody = {
    ...sdkRequests[0],
    max_tokens: 500,
    messages: [
      sdkRequests[0].messages[0],
      { role: 'assistant', content: wireBlocks },
      { role: 'user', content: followUp },
    ],
  };
  const directReplay1Usage = usage(
    await directAnthropicRequest(directReplayBody),
  );
  const directReplay2Usage = usage(
    await directAnthropicRequest(directReplayBody),
  );

  const replayMessages = [
    { role: 'user' as const, content: firstUserMessage },
    ...responseMessages,
    { role: 'user' as const, content: followUp },
  ];
  const turn2 = streamText({
    ...common,
    maxOutputTokens: 500,
    messages: replayMessages,
  });
  await turn2.consumeStream();
  const sdkReplay1Usage = usage(sdkResponses[1]);

  const turn3 = streamText({
    ...common,
    maxOutputTokens: 500,
    messages: replayMessages,
  });
  await turn3.consumeStream();
  const sdkReplay2Usage = usage(sdkResponses[2]);

  printUsage('live code-execution turn', liveUsage);
  printUsage('direct wire replay, first time', directReplay1Usage);
  printUsage('direct wire replay, second time', directReplay2Usage);
  printUsage('AI SDK transcript replay, first time', sdkReplay1Usage);
  printUsage('AI SDK transcript replay, second time', sdkReplay2Usage);

  const directMatchedLiveWrite =
    directReplay1Usage.cacheRead >= liveUsage.cacheWrite;
  const directReplayChains =
    directReplay2Usage.cacheRead > directReplay1Usage.cacheRead;
  const sdkMiss =
    sdkReplay1Usage.cacheRead < directReplay1Usage.cacheRead &&
    sdkReplay1Usage.cacheWrite > directReplay1Usage.cacheWrite;
  const sdkReplayChains = sdkReplay2Usage.cacheRead > sdkReplay1Usage.cacheRead;

  const sdkReplayBlocks = sdkRequests[1].messages[1].content;
  const wireServerToolUse = wireBlocks.find(
    block => block.type === 'server_tool_use',
  );
  const sdkServerToolUse = sdkReplayBlocks.find(
    (block: JsonObject) => block.type === 'server_tool_use',
  );
  const sdkInjectedType =
    wireServerToolUse &&
    sdkServerToolUse &&
    !('type' in wireServerToolUse.input) &&
    sdkServerToolUse.input.type === sdkServerToolUse.name;

  console.log(
    `direct_wire_replay_matched_live_write=${directMatchedLiveWrite} ` +
      `direct_replay_chains=${directReplayChains}`,
  );
  console.log(
    `sdk_live_to_replay_miss=${sdkMiss} sdk_replay_chains=${sdkReplayChains}`,
  );
  console.log(
    `sdk_injected_server_tool_input_type=${Boolean(sdkInjectedType)}`,
  );

  if (sdkMiss && sdkInjectedType) {
    console.error(
      'ISSUE 18193 REPRODUCED: AI SDK replay read fewer live cache tokens than exact wire replay',
    );
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
