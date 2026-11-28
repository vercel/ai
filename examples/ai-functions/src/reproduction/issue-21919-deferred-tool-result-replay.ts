import { createAnthropic } from '@ai-sdk/anthropic';
import type {
  LanguageModelV4CallOptions,
  LanguageModelV4StreamPart,
} from '@ai-sdk/provider';
import assert from 'node:assert/strict';
import {
  convertToModelMessages,
  isStepCount,
  readUIMessageStream,
  simulateReadableStream,
  tool,
  ToolLoopAgent,
  type ModelMessage,
  type UIMessage,
} from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { z } from 'zod';

const SEARCH_CALL_ID = 'search-call';
const INSPECT_CALL_ID = 'inspect-call';
const ACTION_CALL_ID = 'action-call';
const BUG_SIGNAL =
  'ISSUE 21919 REPRODUCED: replay moved the deferred provider result next to its earlier call';

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};

function createTools(anthropic: ReturnType<typeof createAnthropic>) {
  return {
    toolSearch: anthropic.tools.toolSearchBm25_20251119(),
    inspect_context: tool({
      description: 'Inspect the current context before taking action.',
      inputSchema: z.object({}),
      execute: async () => ({ context: 'ready' }),
    }),
    deferred_action: tool({
      description: 'Perform the deferred action requested by the user.',
      inputSchema: z.object({ value: z.string() }),
      execute: async ({ value }) => ({ completed: value }),
      providerOptions: {
        anthropic: { deferLoading: true },
      },
    }),
  };
}

function stream(chunks: LanguageModelV4StreamPart[]) {
  return simulateReadableStream({ chunks });
}

function findAssistantOrdinal(
  messages: ModelMessage[],
  partType: 'tool-call' | 'tool-result',
  toolCallId: string,
) {
  let assistantOrdinal = -1;

  for (const message of messages) {
    if (message.role !== 'assistant') continue;
    assistantOrdinal++;

    if (
      Array.isArray(message.content) &&
      message.content.some(
        part => part.type === partType && part.toolCallId === toolCallId,
      )
    ) {
      return assistantOrdinal;
    }
  }

  return -1;
}

async function collectFinalUIMessage(
  stream: ReturnType<
    Awaited<ReturnType<ToolLoopAgent['stream']>>['toUIMessageStream']
  >,
) {
  let finalMessage: UIMessage | undefined;

  for await (const message of readUIMessageStream({ stream })) {
    finalMessage = message;
  }

  assert.ok(finalMessage, 'The first turn did not produce a UI message.');
  return finalMessage;
}

async function runDeterministicReproduction() {
  const capturedCalls: LanguageModelV4CallOptions[] = [];
  let callIndex = 0;

  const model = new MockLanguageModelV4({
    doStream: async options => {
      capturedCalls.push(options);

      switch (callIndex++) {
        case 0:
          return {
            stream: stream([
              { type: 'stream-start', warnings: [] },
              {
                type: 'tool-call',
                toolCallId: SEARCH_CALL_ID,
                toolName: 'toolSearch',
                input: '{"query":"deferred action"}',
                providerExecuted: true,
              },
              {
                type: 'tool-call',
                toolCallId: INSPECT_CALL_ID,
                toolName: 'inspect_context',
                input: '{}',
              },
              {
                type: 'finish',
                finishReason: { unified: 'tool-calls', raw: 'tool_use' },
                usage,
              },
            ]),
          };

        case 1:
          return {
            stream: stream([
              { type: 'stream-start', warnings: [] },
              {
                type: 'tool-result',
                toolCallId: SEARCH_CALL_ID,
                toolName: 'toolSearch',
                result: [
                  {
                    type: 'tool_reference',
                    toolName: 'deferred_action',
                  },
                ],
              },
              {
                type: 'tool-call',
                toolCallId: ACTION_CALL_ID,
                toolName: 'deferred_action',
                input: '{"value":"done"}',
              },
              {
                type: 'finish',
                finishReason: { unified: 'tool-calls', raw: 'tool_use' },
                usage,
              },
            ]),
          };

        case 2:
          return {
            stream: stream([
              { type: 'stream-start', warnings: [] },
              { type: 'text-start', id: 'final-text' },
              {
                type: 'text-delta',
                id: 'final-text',
                delta: 'Completed.',
              },
              { type: 'text-end', id: 'final-text' },
              {
                type: 'finish',
                finishReason: { unified: 'stop', raw: 'end_turn' },
                usage,
              },
            ]),
          };

        default:
          throw new Error(`Unexpected model call ${callIndex}.`);
      }
    },
  });

  const anthropic = createAnthropic({ apiKey: 'not-used-by-mock' });
  const tools = createTools(anthropic);
  const agent = new ToolLoopAgent({
    model,
    tools,
    stopWhen: isStepCount(3),
  });
  const userMessage: UIMessage = {
    id: 'user-1',
    role: 'user',
    parts: [
      {
        type: 'text',
        text: 'Inspect context and search for the deferred action in parallel, then run it.',
      },
    ],
  };

  const firstTurn = await agent.stream({
    messages: await convertToModelMessages([userMessage]),
  });
  const assistantMessage = await collectFinalUIMessage(
    firstTurn.toUIMessageStream(),
  );

  assert.equal(capturedCalls.length, 3, 'Expected a three-step first turn.');
  const liveLastStepPrompt = capturedCalls[2].prompt;
  const replayedPrompt = await convertToModelMessages(
    [userMessage, assistantMessage],
    { tools },
  );

  const liveCallStep = findAssistantOrdinal(
    liveLastStepPrompt,
    'tool-call',
    SEARCH_CALL_ID,
  );
  const liveResultStep = findAssistantOrdinal(
    liveLastStepPrompt,
    'tool-result',
    SEARCH_CALL_ID,
  );
  const replayedCallStep = findAssistantOrdinal(
    replayedPrompt,
    'tool-call',
    SEARCH_CALL_ID,
  );
  const replayedResultStep = findAssistantOrdinal(
    replayedPrompt,
    'tool-result',
    SEARCH_CALL_ID,
  );

  assert.equal(liveCallStep, 0);
  assert.equal(
    liveResultStep,
    1,
    'Fixture precondition: the provider result arrived in the next assistant step.',
  );
  assert.equal(replayedCallStep, liveCallStep);

  if (replayedResultStep !== liveResultStep) {
    console.error(
      `${BUG_SIGNAL}: live assistant step ${liveResultStep}, replayed assistant step ${replayedResultStep}.`,
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    'Deferred provider result remained in its original assistant step after UI replay.',
  );
}

async function runLiveProviderCheck() {
  const requestBodies: unknown[] = [];
  const anthropic = createAnthropic({
    fetch: async (input, init) => {
      if (typeof init?.body === 'string') {
        requestBodies.push(JSON.parse(init.body));
      }
      return fetch(input, init);
    },
  });
  const agent = new ToolLoopAgent({
    model: anthropic('claude-sonnet-5-5'),
    tools: createTools(anthropic),
    stopWhen: isStepCount(4),
  });

  const result = await agent.stream({
    prompt:
      'In your first response, do exactly these two things in parallel: call inspect_context, and use tool search to find deferred_action. After both complete, call deferred_action with value "done".',
  });

  await result.consumeStream();
  const steps = await result.steps;
  const searchCallStep = steps.findIndex(step =>
    step.content.some(
      part => part.type === 'tool-call' && part.toolName === 'toolSearch',
    ),
  );
  const searchResultStep = steps.findIndex(step =>
    step.content.some(
      part => part.type === 'tool-result' && part.toolName === 'toolSearch',
    ),
  );

  assert.notEqual(
    searchCallStep,
    -1,
    'Live Anthropic response did not call tool search.',
  );
  assert.notEqual(
    searchResultStep,
    -1,
    'Live Anthropic response did not return a tool search result.',
  );
  assert.ok(
    searchResultStep > searchCallStep,
    'Live Anthropic response did not defer the tool search result to a later response.',
  );
  console.log(
    `Live Anthropic check observed the tool search call in step ${searchCallStep} and its deferred result in step ${searchResultStep} across ${requestBodies.length} Messages API requests.`,
  );
}

async function main() {
  if (process.env.LIVE_PROVIDER === '1') {
    await runLiveProviderCheck();
    return;
  }

  await runDeterministicReproduction();
}

main().catch(error => {
  console.error(error);
  process.exitCode = 2;
});
